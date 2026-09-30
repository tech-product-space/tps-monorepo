import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_ENROLLMENT_STATUS,
  WORKFLOW_LIVE_STATUSES,
  WORKFLOW_END_REASON,
  WORKFLOW_ENROLLMENT_SOURCE,
} from "../../config/constants/workflow.js";
import { getWorkflowSettings } from "./settings.service.js";
import { loadVersionDefinition } from "./publish.service.js";
import { resolveEntryNode } from "./validate.js";
import { normaliseEmail } from "../leadEvent/recordLeadEvent.service.js";
import { isSuppressed } from "../subscriber/suppression.service.js";
import { enqueueAdvance, removeAdvanceJob } from "../../queues/workflowQueues.js";
import logger from "../../util/logger.js";

const { Workflow, WorkflowEnrollment } = db;

/**
 * The one way somebody gets into a workflow.
 *
 * Realtime triggers, static-list Runs and manual adds all come through
 * `enrolPerson`, so the four gates below cannot be applied in three slightly
 * different ways — which is exactly how a cap ends up holding on one path and
 * not another.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §5 and §8.
 */

/** Why an enrolment was refused. Counted and shown, never silently dropped. */
export const SKIP_REASON = Object.freeze({
  NO_EMAIL: "noEmail",
  SUPPRESSED: "suppressed",
  ALREADY_IN_THIS: "alreadyInThisWorkflow",
  COMPLETED_BEFORE: "completedBefore",
  CAPPED: "capped",
  NOT_PUBLISHED: "notPublished",
  EMPTY_DEFINITION: "emptyDefinition",
});

/**
 * How many other workflows this person is live in.
 *
 * **Excludes the target workflow**, which is what keeps the two rules apart:
 * cross-workflow volume is this function's job, and same-workflow duplication
 * is the partial unique index's. Overlapping them would make a lead's own
 * existing enrolment block their re-entry.
 */
export const countOtherLiveEnrollments = async (email, excludeWorkflowId) =>
  WorkflowEnrollment.count({
    where: {
      email,
      status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
      ...(excludeWorkflowId ? { workflowId: { [Op.ne]: excludeWorkflowId } } : {}),
    },
  });

/**
 * Enrols one person, or says why not.
 *
 * @returns {Promise<{enrolled: boolean, enrollment?: object, reason?: string}>}
 */
export const enrolPerson = async ({
  workflow,
  email,
  name = null,
  phone = null,
  sourceType = null,
  sourceId = null,
  enrollmentSource = WORKFLOW_ENROLLMENT_SOURCE.MANUAL,
  context = {},
  allowReEnrollment = false,
  /** Pre-fetched by the bulk path so a Run does not read settings per person. */
  settings = null,
  definition = null,
}) => {
  const normalised = normaliseEmail(email);

  if (!normalised) return { enrolled: false, reason: SKIP_REASON.NO_EMAIL };

  if (!workflow?.currentVersion) {
    return { enrolled: false, reason: SKIP_REASON.NOT_PUBLISHED };
  }

  /**
   * Suppression is checked at enrolment as well as before every send.
   *
   * Enrolling somebody who has opted out would mean every step of their journey
   * is checked, skipped and logged — invisible, correct, and pointless. Better
   * never to start.
   */
  if (await isSuppressed(normalised)) {
    return { enrolled: false, reason: SKIP_REASON.SUPPRESSED };
  }

  const def =
    definition ??
    (await loadVersionDefinition(workflow.id, workflow.currentVersion));

  const entry = resolveEntryNode(def);

  if (!entry) return { enrolled: false, reason: SKIP_REASON.EMPTY_DEFINITION };

  /* ── in flight in this workflow already ── */
  const live = await WorkflowEnrollment.findOne({
    where: {
      workflowId: workflow.id,
      email: normalised,
      status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
    },
    attributes: ["id"],
  });

  if (live) return { enrolled: false, reason: SKIP_REASON.ALREADY_IN_THIS };

  /* ── been through it before ── */
  if (!allowReEnrollment) {
    const past = await WorkflowEnrollment.findOne({
      where: {
        workflowId: workflow.id,
        email: normalised,
        status: { [Op.notIn]: WORKFLOW_LIVE_STATUSES },
      },
      attributes: ["id"],
    });

    if (past) return { enrolled: false, reason: SKIP_REASON.COMPLETED_BEFORE };
  }

  /* ── the global cap ── */
  const { maxActiveWorkflowsPerPerson } =
    settings ?? (await getWorkflowSettings());

  const others = await countOtherLiveEnrollments(normalised, workflow.id);

  if (others >= maxActiveWorkflowsPerPerson) {
    return { enrolled: false, reason: SKIP_REASON.CAPPED };
  }

  /* ── in ── */
  let enrollment;

  try {
    enrollment = await WorkflowEnrollment.create({
      workflowId: workflow.id,
      workflowVersion: workflow.currentVersion,
      email: normalised,
      name,
      phone,
      sourceType,
      sourceId: sourceId ? String(sourceId) : null,
      enrollmentSource,
      status: WORKFLOW_ENROLLMENT_STATUS.ACTIVE,
      currentNodeId: entry.id,
      nextRunAt: new Date(),
      context,
      enrolledAt: new Date(),
    });
  } catch (error) {
    /**
     * The partial unique index is what actually holds under concurrency — two
     * triggers for the same person arriving together both pass the check above
     * and one loses here. That is the constraint doing its job, not an error.
     */
    if (error.name === "SequelizeUniqueConstraintError") {
      return { enrolled: false, reason: SKIP_REASON.ALREADY_IN_THIS };
    }
    throw error;
  }

  const job = await enqueueAdvance(enrollment.id, { delay: 0 });

  if (job?.id) await enrollment.update({ jobId: job.id });

  await Workflow.update(
    { lastRunAt: new Date() },
    { where: { id: workflow.id } },
  );

  return { enrolled: true, enrollment };
};

/**
 * Ends every live enrolment for an address.
 *
 * Called when somebody unsubscribes. **Terminating rather than suppressing is
 * the point**: a campaign is a single send, so opting out stops it because
 * there is nothing left, but a workflow has four more emails queued and
 * skipping each one in turn is invisible work that achieves the same thing
 * slower.
 *
 * See §8.2.
 */
export const cancelEnrollmentsForEmail = async (
  email,
  reason = WORKFLOW_END_REASON.OPTED_OUT,
) => {
  const normalised = normaliseEmail(email);

  if (!normalised) return 0;

  const live = await WorkflowEnrollment.findAll({
    where: {
      email: normalised,
      status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
    },
    attributes: ["id", "jobId"],
  });

  if (!live.length) return 0;

  await WorkflowEnrollment.update(
    {
      status: WORKFLOW_ENROLLMENT_STATUS.CANCELLED,
      endReason: reason,
      completedAt: new Date(),
      // Cleared together. A cancelled row left with a due time is exactly what
      // the reconcile cron resurrects five minutes later.
      nextRunAt: null,
      jobId: null,
    },
    { where: { id: { [Op.in]: live.map((e) => e.id) } } },
  );

  // Best-effort: the status change is what stops the journey, and the handler
  // returns early on a non-live enrolment even if a job does slip through.
  await Promise.all(live.map((e) => removeAdvanceJob(e.jobId)));

  logger.info("Cancelled enrolments for opt-out", {
    email: normalised,
    count: live.length,
    reason,
  });

  return live.length;
};

/**
 * Re-queues everything live in a workflow, on resume.
 *
 * Reads `nextRunAt` rather than scheduling from now, so **a three-day wait
 * paused for a day is still due on day three**. TPS lets its queue hold the job
 * through a pause instead, which extends every wait window by the length of the
 * pause — the reason `nextRunAt` is a column here and not merely a job delay.
 */
export const requeueLiveEnrollments = async (workflowId) => {
  const live = await WorkflowEnrollment.findAll({
    where: {
      workflowId,
      status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
    },
    attributes: ["id", "nextRunAt"],
  });

  let requeued = 0;

  for (const enrollment of live) {
    const job = await enqueueAdvance(enrollment.id, {
      runAt: enrollment.nextRunAt ?? new Date(),
    });

    if (job?.id) {
      await WorkflowEnrollment.update(
        { jobId: job.id },
        { where: { id: enrollment.id } },
      );
      requeued += 1;
    }
  }

  logger.info("Re-queued enrolments on resume", { workflowId, requeued });

  return requeued;
};
