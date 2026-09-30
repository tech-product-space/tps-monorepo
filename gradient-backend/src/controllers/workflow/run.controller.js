import { ulid } from "ulid";

import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_STATUS,
  WORKFLOW_TRIGGER_TYPE,
  WORKFLOW_ENROLLMENT_SOURCE,
} from "../../config/constants/workflow.js";
import { enrolPerson } from "../../services/workflow/enrollment.service.js";
import { validateAudience } from "../../services/workflow/validate.js";
import {
  QUEUE_NAMES,
  enqueueBulkEnroll,
  getQueue,
  getQueueHealth,
  getRedisConnection,
  withQueueTimeout,
} from "../../queues/workflowQueues.js";
import { HEARTBEAT_KEY } from "../../workers/workflowWorker.js";
import { buildRecipients } from "../../services/campaign/buildRecipients.js";
import {
  CONDITION_EVENT_TYPES,
  CONDITION_LABELS,
} from "../../services/workflow/conditions.js";
import env from "../../config/env.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import logger from "../../util/logger.js";

const { Workflow } = db;

/**
 * Running a workflow, enrolling one person, and asking whether any of this is
 * actually alive.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §5.2, §5.3 and §10.5.
 */

const notFound = (res) =>
  res.status(404).json({ success: false, message: "Workflow not found" });

/**
 * Static-list Run.
 *
 * Queued rather than done inline: resolving twelve sources over a few thousand
 * people is not something an HTTP request should be holding open, and the
 * response is more useful as "started" plus a run id than as a timeout.
 */
export const runWorkflow = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
    return res.status(409).json({
      success: false,
      message: "Publish this workflow before running it",
    });
  }

  if (workflow.triggerType !== WORKFLOW_TRIGGER_TYPE.STATIC_LIST) {
    return res.status(409).json({
      success: false,
      message:
        "This workflow enrols people automatically from its trigger — there is nothing to run",
    });
  }

  /**
   * The audience is checked before anything is queued.
   *
   * Publishing checks it too, but this workflow may have been published before
   * that check covered the exclude side. The failure it prevents is the quiet
   * one: `buildRecipients` refuses an unresolvable source rather than skipping
   * it, so the throw lands inside the bulk-enrol job — three retries, a failed
   * job, nobody enrolled, and an admin still looking at "Run started".
   */
  const audienceErrors = validateAudience(
    workflow.triggerConfig?.recipientFilters,
  );

  if (audienceErrors.length) {
    return res.status(409).json({
      success: false,
      message: `This workflow's audience cannot be resolved, so nothing was started. ${audienceErrors.join(" ")}`,
      errors: audienceErrors,
    });
  }

  if (!env.workflows.enabled) {
    // Refused rather than accepted-and-dropped. A Run that returns 200 and
    // enrols nobody is the single most confusing state this feature has.
    return res.status(503).json({
      success: false,
      message:
        "Workflows are disabled on this environment (WORKFLOWS_ENABLED). Nothing was queued.",
    });
  }

  const runId = ulid();

  try {
    await enqueueBulkEnroll({ workflowId: workflow.id, runId });
  } catch (error) {
    // Refused out loud rather than reported as started. Nothing was queued, so
    // saying otherwise would have the admin waiting on enrolments that are
    // never coming.
    logger.error("Workflow run could not be queued", {
      workflowId: workflow.id,
      runId,
      error: error.message,
    });

    return res.status(503).json({
      success: false,
      message:
        "Could not reach the job queue, so nothing was started. Check the workflow health banner and try again.",
    });
  }

  req.activity?.set({
    entityLabel: workflow.name,
    metadata: { runId },
  });

  logger.info("Workflow run queued", { workflowId: workflow.id, runId });

  return res.json({ success: true, data: { runId, status: "queued" } });
});

/**
 * Is a Run of this workflow still going?
 *
 * Nothing on the workflow row records this. `lastRunAt` is "last time it
 * enrolled anybody", which is a different question and deliberately so — it
 * answers "is this thing alive", and stamping it when a Run is *queued* would
 * make a workflow whose worker is dead look like it had run.
 *
 * So the queue is the answer, because the queue is where the truth is: a
 * bulk-enrol job for this workflow that is waiting, delayed or being worked is
 * a run in progress. The panel needs it for two things it could not otherwise
 * do honestly — leave Pause reachable while a run is going, and only tick
 * "Run it" once the run is actually over.
 */
export const getRunStatus = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id, {
    attributes: ["id", "lastRunAt"],
  });

  if (!workflow) return notFound(res);

  const queue = getQueue(QUEUE_NAMES.BULK_ENROLL);

  let pending = 0;

  if (queue) {
    try {
      /**
       * The whole queue, filtered in memory rather than by a Redis query.
       *
       * BullMQ cannot index on job data, and this queue runs at concurrency 1
       * with one job per Run — it holds a handful of entries, not thousands.
       * If that ever stops being true this becomes a count of runs in a table,
       * not a smarter Redis query.
       */
      const jobs = await withQueueTimeout(
        queue.getJobs(["active", "waiting", "delayed", "paused"]),
      );

      pending = jobs.filter(
        (job) => job?.data?.workflowId === workflow.id,
      ).length;
    } catch (error) {
      // Redis being unreachable is already reported by /health, and a failure
      // here must not break the editor header. "Not running" is the safe
      // answer: it leaves Run pressable rather than stuck on "Running…".
      logger.warn("Could not read the bulk-enrol queue", {
        workflowId: workflow.id,
        error: error.message,
      });
    }
  }

  return res.json({
    success: true,
    data: { running: pending > 0, pending, lastRunAt: workflow.lastRunAt },
  });
});

/**
 * How many people the audience resolves to right now.
 *
 * The number the publish dialog states before an admin commits. Read-only and
 * deliberately separate from Run — seeing "3,480 people" and choosing to go
 * ahead is a different act from pressing a button that does both.
 */
export const previewAudience = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  if (workflow.triggerType !== WORKFLOW_TRIGGER_TYPE.STATIC_LIST) {
    return res.status(409).json({
      success: false,
      message: "Only a static-list workflow has an audience to preview",
    });
  }

  /**
   * Named, rather than thrown.
   *
   * Without this the unresolvable-source error escapes to the global handler as
   * a 500, and the panel shows "something went wrong" for a mistake it can
   * name. "Nobody matched" and "that source does not work" must never look the
   * same to whoever is staring at a preview of zero — a 500 is the third way of
   * saying neither.
   */
  const audienceErrors = validateAudience(
    workflow.triggerConfig?.recipientFilters,
    { requireInclude: false },
  );

  if (audienceErrors.length) {
    return res.status(409).json({
      success: false,
      message: `This audience cannot be resolved. ${audienceErrors.join(" ")}`,
      errors: audienceErrors,
    });
  }

  const { recipients, stats } = await buildRecipients(
    workflow.triggerConfig?.recipientFilters,
  );

  return res.json({
    success: true,
    data: {
      total: recipients.length,
      excluded: stats?.excluded ?? 0,
      // A handful of real addresses, so an admin can sanity-check the filter
      // rather than trusting a count.
      sample: recipients.slice(0, 5).map((r) => ({
        email: r.email,
        name: r.name,
        sourceType: r.sourceType,
      })),
    },
  });
});

/**
 * Enrol one person by email.
 *
 * For testing a journey on yourself, and for the one-off "put this person
 * through the nurture sequence" that otherwise becomes a message to whoever
 * owns the panel. Every gate still applies — suppression, in-flight, past-run
 * and the cap — and the refusal reason comes back verbatim, because a manual
 * add that silently does nothing is worse than one that says why.
 */
export const enrolOne = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  const { email, name, allowReEnrollment } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "An email is required" });
  }

  if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
    return res.status(409).json({
      success: false,
      message: "Publish this workflow before enrolling anybody",
    });
  }

  const outcome = await enrolPerson({
    workflow,
    email,
    name: name ?? null,
    enrollmentSource: WORKFLOW_ENROLLMENT_SOURCE.MANUAL,
    allowReEnrollment: Boolean(allowReEnrollment),
    context: { enrolledBy: req.admin?.id ?? null },
  });

  if (!outcome.enrolled) {
    return res.status(409).json({
      success: false,
      message: "Not enrolled",
      reason: outcome.reason,
    });
  }

  return res
    .status(201)
    .json({ success: true, data: { enrollmentId: outcome.enrollment.id } });
});

/**
 * The questions a branch step can ask.
 *
 * Served rather than duplicated in the panel: the list is derived from
 * `LEAD_EVENT_TYPE`, so a new event type recorded by the backend appears in the
 * editor without a matching frontend change — and, more to the point, one that
 * is *not* recorded can never be offered.
 */
export const getConditionOptions = asyncWrapper(async (req, res) =>
  res.json({
    success: true,
    data: CONDITION_EVENT_TYPES.map((eventType) => ({
      eventType,
      label: CONDITION_LABELS[eventType],
    })),
  }),
);

/**
 * Is any of this actually running?
 *
 * The first thing to look at when someone says a workflow did not fire, and
 * what the panel's banner reads. Three separate questions, because they fail
 * separately: is the feature switched on, is Redis reachable, and has a worker
 * checked in.
 */
export const getHealth = asyncWrapper(async (req, res) => {
  const health = await getQueueHealth();

  let workerSeenAt = null;

  if (health.redis === "up") {
    try {
      const beat = await getRedisConnection().get(HEARTBEAT_KEY);
      workerSeenAt = beat ? new Date(Number(beat)) : null;
    } catch {
      workerSeenAt = null;
    }
  }

  /**
   * A worker that has not beaten in five minutes counts as absent.
   *
   * The heartbeat is every 30 seconds with a 90-second expiry, so this is
   * generous on purpose — a missed beat during a deploy should not light up
   * the panel.
   */
  const workerAlive =
    Boolean(workerSeenAt) && Date.now() - workerSeenAt.getTime() < 5 * 60 * 1000;

  return res.json({
    success: true,
    data: {
      ...health,
      workerSeenAt,
      workerAlive,
      // What the banner says. Assembled here rather than in the panel so the
      // wording lives next to the logic that decides it.
      healthy: health.enabled && health.redis === "up" && workerAlive,
      message: !health.enabled
        ? "Workflows are disabled on this environment. Nothing will be enrolled or sent."
        : health.redis !== "up"
          ? "Cannot reach Redis. Workflows are not running."
          : !workerAlive
            ? "No workflow worker has checked in. Publishing works, but nobody will be enrolled or emailed."
            : "Workflows are running.",
    },
  });
});
