"use strict";

const { Op } = require("sequelize");
const {
  WorkflowEnrollment,
  WorkflowNodeRun,
  Workflow,
} = require("../../../models");
const {
  ENROLLMENT_STATUS,
  WORKFLOW_STATUS,
} = require("../../../constants/workflow");
const {
  enqueueAdvance,
  workflowAdvanceQueue,
} = require("../../../queues/workflowQueues");

const DEFAULT_STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const BATCH_LIMIT = 1000;

/**
 * Sweep stuck/missed enrollments and re-enqueue their advance jobs.
 *
 * Catches:
 *   - Worker crashed between commit and BullMQ enqueue
 *   - Workflow was paused so BullMQ retries exhausted; resume happens → those
 *     enrollments still have status='active' but no live job
 *   - Redis flushed/lost jobs
 *
 * Idempotent because:
 *   - jobId is deterministic (enrollment_id:node_id:1)
 *   - advanceEnrollment guards on current_node_id mismatch and unique
 *     constraint on workflow_node_runs
 */
async function reconcileOnce(options = {}) {
  const thresholdMs =
    typeof options.thresholdMs === "number"
      ? options.thresholdMs
      : DEFAULT_STALE_THRESHOLD_MS;
  const cutoff = new Date(Date.now() - thresholdMs);

  // Find active OR waiting enrollments whose next_scheduled_at is past due.
  // WAITING enrollments are parked on a control.condition node and need a
  // re-enqueue if their timeout job was dropped (e.g. Redis flushed).
  // Join workflows to skip enrollments whose workflow is paused.
  const stuck = await WorkflowEnrollment.findAll({
    where: {
      status: [ENROLLMENT_STATUS.ACTIVE, ENROLLMENT_STATUS.WAITING],
      current_node_id: { [Op.ne]: null },
      next_scheduled_at: { [Op.lt]: cutoff },
    },
    order: [["next_scheduled_at", "ASC"]],
    limit: BATCH_LIMIT,
    include: [
      {
        model: Workflow,
        as: "workflow",
        attributes: ["id", "status"],
        required: true,
      },
    ],
  });

  let requeued = 0;
  let skipped = 0;

  for (const enrollment of stuck) {
    if (enrollment.workflow?.status !== WORKFLOW_STATUS.ACTIVE) {
      skipped += 1;
      continue;
    }
    try {
      // BullMQ keeps failed jobs around (removeOnFail.age). Re-enqueuing
      // with the same jobId is a no-op. Two-step defence:
      //   1. Remove any existing job at the canonical jobId.
      //   2. Compute a fresh attempt number based on existing node_runs so
      //      the new run is a distinct attempt for audit purposes.
      const maxAttempt = await WorkflowNodeRun.max("attempt", {
        where: {
          enrollment_id: enrollment.id,
          node_id: enrollment.current_node_id,
        },
      });
      const nextAttempt = (Number.isFinite(maxAttempt) ? maxAttempt : 0) + 1;
      const jobId = `${enrollment.id}:${enrollment.current_node_id}:${nextAttempt}`;

      try {
        const existing = await workflowAdvanceQueue.getJob(jobId);
        if (existing) await existing.remove();
      } catch (_) {
        /* best-effort cleanup */
      }

      await enqueueAdvance({
        enrollmentId: enrollment.id,
        nodeId: enrollment.current_node_id,
        attempt: nextAttempt,
        delayMs: 0,
      });
      requeued += 1;
    } catch (err) {
      console.error(
        `[reconcile] enqueue failed enr=${enrollment.id}:`,
        err.message
      );
    }
  }

  return { scanned: stuck.length, requeued, skipped };
}

module.exports = { reconcileOnce };
