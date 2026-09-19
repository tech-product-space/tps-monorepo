import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_STATUS,
  WORKFLOW_EDITABLE_FIELDS,
  WORKFLOW_ENROLLMENT_STATUS,
  WORKFLOW_LIVE_STATUSES,
  WORKFLOW_END_REASON,
  EMPTY_DEFINITION,
} from "../../config/constants/workflow.js";
import { validateWorkflow } from "../../services/workflow/validate.js";
import { publishWorkflow as publish } from "../../services/workflow/publish.service.js";
import { requeueLiveEnrollments } from "../../services/workflow/enrollment.service.js";
import { composeWorkflowEmail } from "../../services/workflow/dispatch/emailDispatcher.js";
import { sendMail } from "../../services/email/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import logger from "../../util/logger.js";

const { Workflow, WorkflowVersion, WorkflowEnrollment, sequelize } = db;

/** Only the fields a client owns. Everything else belongs to publish and the
 *  runner — see `WORKFLOW_EDITABLE_FIELDS`. */
const pickEditable = (body = {}) =>
  Object.fromEntries(
    Object.entries(body).filter(([k]) => WORKFLOW_EDITABLE_FIELDS.includes(k)),
  );

const notFound = (res) =>
  res.status(404).json({ success: false, message: "Workflow not found" });

/* ── list ───────────────────────────────────────────────────────────────── */

export const listWorkflows = asyncWrapper(async (req, res) => {
  const { status, search } = req.query;
  const { page, limit, offset } = getPaginationParams(req.query);

  const where = {};

  // Archived is opt-in. It is the bin, and a list that shows the bin by default
  // gets longer forever.
  if (status) where.status = status;
  else where.status = { [Op.ne]: WORKFLOW_STATUS.ARCHIVED };

  if (search) where.name = { [Op.iLike]: `%${search}%` };

  const { rows, count } = await Workflow.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  /**
   * Live counts for the whole page in one query.
   *
   * Per-row counting is how a list page turns into forty round trips, and the
   * live count is the column people actually scan — a workflow with a trigger
   * and zero live enrolments is the one worth looking at.
   */
  const counts = await WorkflowEnrollment.findAll({
    where: {
      workflowId: { [Op.in]: rows.map((r) => r.id) },
      status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
    },
    attributes: [
      "workflowId",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    group: ["workflowId"],
    raw: true,
  });

  const liveByWorkflow = new Map(
    counts.map((c) => [c.workflowId, Number(c.count)]),
  );

  return res.json({
    success: true,
    data: rows.map((w) => ({
      ...w.toJSON(),
      liveEnrollments: liveByWorkflow.get(w.id) ?? 0,
    })),
    meta: getMeta(count, page, limit),
  });
});

/* ── read ───────────────────────────────────────────────────────────────── */

export const getWorkflow = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  const [activeVersion, stats] = await Promise.all([
    workflow.currentVersion
      ? WorkflowVersion.findOne({
          where: { workflowId: workflow.id, version: workflow.currentVersion },
        })
      : null,
    WorkflowEnrollment.findAll({
      where: { workflowId: workflow.id },
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["status"],
      raw: true,
    }),
  ]);

  return res.json({
    success: true,
    data: {
      workflow,
      activeVersion,
      // Computed, never stored. Denormalised counters that drift from their
      // source rows are worse than a slightly slower query.
      stats: Object.fromEntries(
        Object.values(WORKFLOW_ENROLLMENT_STATUS).map((s) => [
          s,
          Number(stats.find((r) => r.status === s)?.count ?? 0),
        ]),
      ),
      // Live, so the panel can show what publishing would refuse before the
      // admin clicks it.
      validation: validateWorkflow(workflow),
    },
  });
});

/* ── create / update ────────────────────────────────────────────────────── */

export const createWorkflow = asyncWrapper(async (req, res) => {
  const { name } = req.body;

  if (!name?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "A name is required" });
  }

  const workflow = await Workflow.create({
    name: name.trim(),
    description: req.body.description?.trim() || null,
    definition: { ...EMPTY_DEFINITION },
    createdBy: req.admin?.id ?? null,
  });

  return res.status(201).json({ success: true, data: workflow });
});

/** The two fields that stop being editable once a version exists. */
const TRIGGER_FIELDS = ["triggerType", "triggerConfig"];

/**
 * Edits the draft.
 *
 * **A live workflow stays editable.** The draft moves; the published version
 * does not, so the people already walking it finish the journey they started.
 * Locking the editor on publish is what pushes a panel into a graveyard of
 * `Nurture v2 (copy)`.
 *
 * **The trigger is the exception, and it freezes at the first publish.** The
 * steps are what a workflow *does*; the trigger is what it *is*. Publishing a
 * new version with a different audience does not amend the automation, it
 * quietly repurposes it — the reports, the enrolment list and the name all keep
 * describing the workflow it used to be, while the people entering it are a
 * different set entirely. The version snapshot already treats the two as one
 * unit for this reason: "the same steps fed by a different audience is a
 * different workflow". A different workflow should be a different workflow, and
 * duplicating is how you get one.
 *
 * Archived is the other refusal: it is the bin, and editing something in the
 * bin means someone thinks it is live.
 */
export const updateWorkflow = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  if (workflow.status === WORKFLOW_STATUS.ARCHIVED) {
    return res.status(409).json({
      success: false,
      message: "This workflow is archived. Duplicate it to keep working on it.",
    });
  }

  const updates = pickEditable(req.body);

  /**
   * Refused rather than silently dropped.
   *
   * Accepting the request and ignoring the field would leave the panel showing
   * an audience the workflow does not have — the worst of the three options,
   * because it looks like it worked.
   */
  if (workflow.currentVersion) {
    const attempted = TRIGGER_FIELDS.filter(
      (field) =>
        field in updates &&
        JSON.stringify(updates[field] ?? null) !==
          JSON.stringify(workflow[field] ?? null),
    );

    if (attempted.length) {
      return res.status(409).json({
        success: false,
        message:
          "The trigger is fixed once a workflow has been published. Duplicate it to send the same steps to a different audience.",
        fields: attempted,
      });
    }
  }

  await workflow.update(updates);

  req.activity?.set({ entityLabel: workflow.name });

  return res.json({
    success: true,
    data: workflow,
    validation: validateWorkflow(workflow),
  });
});

/* ── lifecycle ──────────────────────────────────────────────────────────── */

/** No side effects. Same function `publish` calls, so the two cannot disagree. */
export const validateWorkflowEndpoint = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  return res.json({ success: true, data: validateWorkflow(workflow) });
});

export const publishWorkflow = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  if (workflow.status === WORKFLOW_STATUS.ARCHIVED) {
    return res
      .status(409)
      .json({ success: false, message: "This workflow is archived" });
  }

  const result = await publish(workflow, { publishedBy: req.admin?.id ?? null });

  if (!result.published) {
    // 422, not 400: the request is well-formed, the workflow is not ready. The
    // panel renders these as a checklist, so every error goes back, not the
    // first.
    return res.status(422).json({
      success: false,
      message: "This workflow is not ready to publish",
      errors: result.errors,
    });
  }

  req.activity?.set({
    entityLabel: workflow.name,
    metadata: { version: result.version },
  });

  return res.json({
    success: true,
    data: { workflow: result.workflow, version: result.version },
  });
});

export const pauseWorkflow = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
    return res
      .status(409)
      .json({ success: false, message: "Only an active workflow can be paused" });
  }

  await workflow.update({ status: WORKFLOW_STATUS.PAUSED });

  req.activity?.set({ entityLabel: workflow.name });

  return res.json({ success: true, data: workflow });
});

/**
 * Resume.
 *
 * Re-queuing the live enrolments belongs to phase 3, and it reads `nextRunAt`
 * rather than rescheduling from now — a three-day wait paused for a day is
 * still due on day three. Until the queue exists, this only flips the status.
 */
export const resumeWorkflow = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  if (workflow.status !== WORKFLOW_STATUS.PAUSED) {
    return res
      .status(409)
      .json({ success: false, message: "This workflow is not paused" });
  }

  if (!workflow.currentVersion) {
    return res.status(409).json({
      success: false,
      message: "This workflow has never been published",
    });
  }

  await workflow.update({ status: WORKFLOW_STATUS.ACTIVE });

  /**
   * Re-queue from the stored `nextRunAt`, not from now.
   *
   * A three-day wait paused for a day is still due on day three. TPS lets its
   * queue hold the job through a pause instead, which extends every wait window
   * by the length of the pause — see §6.5.2.
   */
  const requeued = await requeueLiveEnrollments(workflow.id);

  req.activity?.set({ entityLabel: workflow.name, metadata: { requeued } });

  return res.json({ success: true, data: { workflow, requeued } });
});

/**
 * Archive, never delete.
 *
 * The node runs are the record of what was sent to whom, and destroying a
 * workflow would cascade them away. Live enrolments are cancelled with a reason
 * rather than left pointing at something nobody can open.
 */
export const archiveWorkflow = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  // Captured before the write — the automatic label lookup cannot see a row
  // after the fact, and this is the same reason a delete captures it manually.
  req.activity?.set({ entityLabel: workflow.name });

  const cancelled = await WorkflowEnrollment.update(
    {
      status: WORKFLOW_ENROLLMENT_STATUS.CANCELLED,
      endReason: WORKFLOW_END_REASON.WORKFLOW_ARCHIVED,
      completedAt: new Date(),
      nextRunAt: null,
      jobId: null,
    },
    {
      where: {
        workflowId: workflow.id,
        status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
      },
    },
  );

  await workflow.update({ status: WORKFLOW_STATUS.ARCHIVED });

  req.activity?.set({ metadata: { cancelledEnrollments: cancelled[0] ?? 0 } });

  logger.info("Workflow archived", {
    workflowId: workflow.id,
    cancelledEnrollments: cancelled[0] ?? 0,
  });

  return res.json({
    success: true,
    data: { id: workflow.id, cancelledEnrollments: cancelled[0] ?? 0 },
  });
});

export const duplicateWorkflow = asyncWrapper(async (req, res) => {
  const source = await Workflow.findByPk(req.params.id);

  if (!source) return notFound(res);

  const copy = await Workflow.create({
    name: `${source.name} (copy)`,
    description: source.description,
    // A copy is always a draft, whatever the original is. Duplicating a live
    // workflow into another live workflow would double everybody's mail with
    // one click.
    status: WORKFLOW_STATUS.DRAFT,
    triggerType: source.triggerType,
    triggerConfig: source.triggerConfig,
    definition: source.definition,
    settings: source.settings,
    createdBy: req.admin?.id ?? null,
  });

  return res.status(201).json({ success: true, data: copy });
});

/* ── test send ──────────────────────────────────────────────────────────── */

/**
 * Sends one step's email to a named address.
 *
 * Composes through `composeWorkflowEmail`, the same function the dispatcher
 * uses, so what an admin tests is what ships — UTM rewrite, marketing footer,
 * unsubscribe link and all.
 */
export const sendTestEmail = asyncWrapper(async (req, res) => {
  const { to, config } = req.body;

  if (!to || !config?.subject || !config?.body || !config?.senderEmail) {
    return res.status(400).json({
      success: false,
      message: "to, and a config with subject, body and senderEmail, are required",
    });
  }

  const workflow = req.params.id
    ? await Workflow.findByPk(req.params.id)
    : null;

  const { subject, html } = composeWorkflowEmail({
    config,
    workflow,
    recipient: { email: to, name: req.admin?.name },
  });

  const result = await sendMail({
    fromEmail: config.senderEmail,
    fromName: config.senderName || undefined,
    to,
    // Marked, so a test landing in a shared inbox is never mistaken for the
    // real send going out early.
    subject: `[TEST] ${subject}`,
    html,
  });

  // `sendMail` resolves on failure, so this must be checked rather than assumed.
  if (!result.success) {
    return res.status(502).json({
      success: false,
      message: result.error || "Could not send the test email",
    });
  }

  return res.json({ success: true, data: { to } });
});
