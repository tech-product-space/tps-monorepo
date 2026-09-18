"use strict";

const { Op, Transaction } = require("sequelize");
const {
  LeadEvent,
  WorkflowConditionWaiter,
} = require("../../../../models");
const {
  EDGE_LABEL,
  DURATION_UNIT,
  ENROLLMENT_STATUS,
} = require("../../../../constants/workflow");
const { enqueueAdvance } = require("../../../../queues/workflowQueues");

const UNIT_MS = {
  [DURATION_UNIT.SECONDS]: 1000,
  [DURATION_UNIT.MINUTES]: 60_000,
  [DURATION_UNIT.HOURS]: 3_600_000,
  [DURATION_UNIT.DAYS]: 86_400_000,
  [DURATION_UNIT.WEEKS]: 7 * 86_400_000,
};

/**
 * control.condition — "If / then" node. Parks the enrollment until either
 * the configured LeadEvent arrives for this lead, or the timeout elapses.
 *
 * Config: { event_type, timeout_value, timeout_unit }
 *
 * Two outgoing edges required:
 *   - label='match'    → followed when the event arrived in time
 *   - label='no_match' → followed when the timeout fired first
 *
 * Two phases in one handler:
 *   Phase A (first entry): no waiter row exists → create it, set the
 *   enrollment to WAITING, schedule the timeout advance, return outcome=park.
 *   The advance engine recognises 'park' and stops without scheduling the
 *   next node — current_node_id stays on this node.
 *
 *   Phase B (re-entry): a waiter row exists. Either the timeout fired, or
 *   wakeWaiters re-enqueued us because a matching LeadEvent landed. We lock
 *   the waiter row (settles the race if both jobs fire), check whether a
 *   matching event has been recorded since the waiter was created, delete
 *   the waiter row, flip the enrollment back to ACTIVE, and return
 *   outcome=next on the appropriate branch.
 */
exports.execute = async ({ enrollment, node, edges, tx }) => {
  const cfg = node.config || {};
  const eventType = cfg.event_type;
  const timeoutUnit = cfg.timeout_unit;
  const timeoutValue = cfg.timeout_value;

  if (!eventType || !UNIT_MS[timeoutUnit] || !timeoutValue) {
    const err = new Error(`condition: invalid config on node ${node.id}`);
    err.retryable = false;
    throw err;
  }

  // Look up existing waiter for this enrollment (locked so a concurrent
  // wake-up sees a consistent view). The waiter is unique per enrollment.
  const existing = await WorkflowConditionWaiter.findOne({
    where: { enrollment_id: enrollment.id },
    lock: Transaction.LOCK.UPDATE,
    transaction: tx,
  });

  if (!existing) {
    console.log(
      `[condition] PARK enr=${enrollment.id} node=${node.id} wait_for=${eventType} ` +
        `timeout=${timeoutValue}${timeoutUnit}`
    );
    return await park({ enrollment, node, eventType, timeoutValue, timeoutUnit, tx });
  }

  console.log(
    `[condition] RESUME enr=${enrollment.id} node=${node.id} ` +
      `waiter_created_at=${existing.createdAt?.toISOString?.() || existing.createdAt}`
  );
  return await resume({ enrollment, node, edges, waiter: existing, tx });
};

async function park({ enrollment, node, eventType, timeoutValue, timeoutUnit, tx }) {
  const timeoutMs = timeoutValue * UNIT_MS[timeoutUnit];
  const expiresAt = new Date(Date.now() + timeoutMs);

  await WorkflowConditionWaiter.create(
    {
      enrollment_id: enrollment.id,
      node_id: node.id,
      event_type: eventType,
      lead_source_type: enrollment.lead_source_type,
      lead_source_id: String(enrollment.lead_source_id),
      expires_at: expiresAt,
    },
    { transaction: tx }
  );

  await enrollment.update(
    {
      status: ENROLLMENT_STATUS.WAITING,
      next_scheduled_at: expiresAt,
    },
    { transaction: tx }
  );

  // Schedule the timeout job. Use attempt=2 so its BullMQ jobId is distinct
  // from the parking advance (attempt=1) and from the wake-from-event advance
  // (attempt=3), so deterministic IDs don't collide.
  tx.afterCommit(() => {
    enqueueAdvance({
      enrollmentId: enrollment.id,
      nodeId: node.id,
      attempt: 2,
      delayMs: timeoutMs,
    }).catch((err) =>
      console.error(
        `[condition] schedule timeout failed enr=${enrollment.id}:`,
        err.message
      )
    );
  });

  return {
    outcome: "park",
    output: {
      waiting_for: eventType,
      expires_at: expiresAt.toISOString(),
    },
  };
}

async function resume({ enrollment, node, edges, waiter, tx }) {
  // Has the event occurred for this lead since we started waiting?
  const matchedCount = await LeadEvent.count({
    where: {
      lead_source_type: waiter.lead_source_type,
      lead_source_id: String(waiter.lead_source_id),
      event_type: waiter.event_type,
      occurred_at: { [Op.gte]: waiter.createdAt },
    },
    transaction: tx,
  });
  const matched = matchedCount > 0;

  // Drop the waiter row. If the other half of the race (timeout vs wake)
  // re-enters this handler before our tx commits, its findOne with FOR UPDATE
  // will block; after commit it'll find no row and bail with already_woken.
  await waiter.destroy({ transaction: tx });

  await enrollment.update(
    { status: ENROLLMENT_STATUS.ACTIVE },
    { transaction: tx }
  );

  const wantedLabel = matched ? EDGE_LABEL.MATCH : EDGE_LABEL.NO_MATCH;
  const edge = (edges || []).find(
    (e) => e.from === node.id && e.label === wantedLabel
  );
  if (!edge) {
    const err = new Error(`condition_no_edge:${node.id}:${wantedLabel}`);
    err.retryable = false;
    throw err;
  }

  console.log(
    `[condition] RESOLVED enr=${enrollment.id} node=${node.id} ` +
      `matched=${matched} branch=${wantedLabel} -> ${edge.to}`
  );

  return {
    outcome: "next",
    next_node_id: edge.to,
    output: {
      chosen_next: edge.to,
      branch: wantedLabel,
      matched,
      event_type: waiter.event_type,
    },
  };
}
