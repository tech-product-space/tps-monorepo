import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_ENROLLMENT_STATUS,
  WORKFLOW_LIVE_STATUSES,
  WORKFLOW_END_REASON,
} from "../../config/constants/workflow.js";
import { loadVersionDefinition } from "../../services/workflow/publish.service.js";
import { normaliseEmail } from "../../services/leadEvent/recordLeadEvent.service.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";

const { WorkflowEnrollment, WorkflowNodeRun, Workflow, LeadEvent } = db;

/**
 * Who is in a workflow, where they are, and what happened to them.
 *
 * Read-only apart from cancel. Enrolments and node runs are deliberately **not**
 * activity-logged: they are already their own timestamped records, exactly like
 * the public-site writes the log skips, and one workflow run would otherwise
 * write thousands of rows into the admin audit trail.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §9 and §11.2.
 */

export const listEnrollments = asyncWrapper(async (req, res) => {
  const { workflowId, status, email } = req.query;
  const { page, limit, offset } = getPaginationParams(req.query, 25, 100);

  const where = {};
  if (workflowId) where.workflowId = workflowId;
  if (status) where.status = status;
  if (email) where.email = normaliseEmail(email);

  const { rows, count } = await WorkflowEnrollment.findAndCountAll({
    where,
    include: [
      { model: Workflow, as: "workflow", attributes: ["id", "name", "status"] },
    ],
    order: [["enrolledAt", "DESC"]],
    limit,
    offset,
  });

  return res.json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

/**
 * One person's run, in full.
 *
 * The step log and their activity timeline side by side, because together they
 * answer the only question anyone asks about an automation: *why did they get
 * that*. `currentStep` is resolved against the frozen version rather than the
 * draft — the draft may no longer contain the node they are standing on.
 */
export const getEnrollment = asyncWrapper(async (req, res) => {
  const enrollment = await WorkflowEnrollment.findByPk(req.params.id, {
    include: [
      { model: Workflow, as: "workflow", attributes: ["id", "name", "status"] },
    ],
  });

  if (!enrollment) {
    return res
      .status(404)
      .json({ success: false, message: "Enrolment not found" });
  }

  const [nodeRuns, definition, events] = await Promise.all([
    WorkflowNodeRun.findAll({
      where: { enrollmentId: enrollment.id },
      order: [["startedAt", "ASC"]],
    }),
    loadVersionDefinition(enrollment.workflowId, enrollment.workflowVersion),
    LeadEvent.findAll({
      where: { email: enrollment.email },
      order: [["occurredAt", "DESC"]],
      limit: 50,
    }),
  ]);

  const currentStep =
    definition?.nodes?.find((n) => n.id === enrollment.currentNodeId) ?? null;

  return res.json({
    success: true,
    data: {
      enrollment,
      currentStep,
      // The whole graph, so the panel can draw where they are within it without
      // a second call.
      definition,
      nodeRuns,
      events,
    },
  });
});

/**
 * Cancel one enrolment.
 *
 * Clears `nextRunAt` and `jobId` as well as flipping the status. Leaving a
 * cancelled row with a due time is what makes the reconcile cron resurrect it
 * five minutes later.
 */
export const cancelEnrollment = asyncWrapper(async (req, res) => {
  const enrollment = await WorkflowEnrollment.findByPk(req.params.id);

  if (!enrollment) {
    return res
      .status(404)
      .json({ success: false, message: "Enrolment not found" });
  }

  if (!WORKFLOW_LIVE_STATUSES.includes(enrollment.status)) {
    return res.status(409).json({
      success: false,
      message: "This enrolment has already ended",
    });
  }

  await enrollment.update({
    status: WORKFLOW_ENROLLMENT_STATUS.CANCELLED,
    endReason: WORKFLOW_END_REASON.CANCELLED,
    completedAt: new Date(),
    nextRunAt: null,
    jobId: null,
  });

  return res.json({ success: true, data: enrollment });
});

/**
 * Cancel many.
 *
 * Scoped to a workflow or to an explicit list of ids — never unbounded. A
 * bulk-cancel with no scope is one fat-fingered request away from ending every
 * journey in the system, and there is no undo.
 */
export const bulkCancelEnrollments = asyncWrapper(async (req, res) => {
  const { workflowId, ids } = req.body;

  if (!workflowId && !Array.isArray(ids)) {
    return res.status(400).json({
      success: false,
      message: "Pass a workflowId or a list of enrolment ids",
    });
  }

  const where = { status: { [Op.in]: WORKFLOW_LIVE_STATUSES } };
  if (workflowId) where.workflowId = workflowId;
  if (Array.isArray(ids) && ids.length) where.id = { [Op.in]: ids };

  const [affected] = await WorkflowEnrollment.update(
    {
      status: WORKFLOW_ENROLLMENT_STATUS.CANCELLED,
      endReason: WORKFLOW_END_REASON.CANCELLED,
      completedAt: new Date(),
      nextRunAt: null,
      jobId: null,
    },
    { where },
  );

  // For a bulk action the count is the interesting part.
  req.activity?.set({ metadata: { affectedCount: affected } });

  return res.json({ success: true, data: { cancelled: affected } });
});
