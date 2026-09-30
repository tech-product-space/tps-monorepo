"use strict";

const { Op } = require("sequelize");
const { WorkflowConditionWaiter } = require("../../../models");
const { enqueueAdvance } = require("../../../queues/workflowQueues");

/**
 * Called after a LeadEvent row is inserted. Finds any enrollments currently
 * parked on a control.condition node listening for this (lead, event)
 * combination and re-enqueues the advance job for each, so the engine can
 * resume them.
 *
 * Uses attempt=3 in the deterministic BullMQ jobId so the wake-from-event
 * job doesn't collide with the parking attempt (1) or the timeout job (2).
 *
 * Best-effort: failures are logged and swallowed — event recording must
 * never fail because a downstream queue is unhappy.
 */
async function wakeWaiters({
  leadSourceType,
  leadSourceId,
  eventType,
}) {
  if (!leadSourceType || !leadSourceId || !eventType) return;

  try {
    const now = new Date();
    const waiters = await WorkflowConditionWaiter.findAll({
      where: {
        lead_source_type: leadSourceType,
        lead_source_id: String(leadSourceId),
        event_type: eventType,
        expires_at: { [Op.gt]: now },
      },
    });

    if (waiters.length === 0) return;

    for (const w of waiters) {
      console.log(
        `[wakeWaiters] event=${eventType} lead=${leadSourceType}:${leadSourceId} ` +
          `→ wake enr=${w.enrollment_id} node=${w.node_id}`
      );
    }

    await Promise.allSettled(
      waiters.map((w) =>
        enqueueAdvance({
          enrollmentId: w.enrollment_id,
          nodeId: w.node_id,
          attempt: 3,
          delayMs: 0,
        })
      )
    );
  } catch (err) {
    console.error("wakeWaiters failed:", err.message);
  }
}

module.exports = { wakeWaiters };
