"use strict";

const { LeadEvent } = require("../../../models");
const { wakeWaiters } = require("./wakeWaiters");

/**
 * Insert a row into lead_events. Idempotent if a `dedupe_key` is supplied
 * (collisions are swallowed). All other failures are logged but never thrown
 * — event recording is observational; it must never break the engine or a
 * webhook.
 *
 * After the event lands (or after the supplied transaction commits, when one
 * is passed), wakeWaiters is called to re-enqueue any enrollments parked on
 * a control.condition node listening for this (lead, event) pair.
 * Failures there are logged and swallowed.
 */
async function recordLeadEvent({
  leadSourceType,
  leadSourceId,
  eventType,
  occurredAt,
  enrollmentId,
  workflowNodeRunId,
  providerMessageId,
  payload,
  dedupeKey,
  transaction,
}) {
  if (!leadSourceType || !leadSourceId || !eventType) return null;

  try {
    const row = await LeadEvent.create(
      {
        lead_source_type: leadSourceType,
        lead_source_id: String(leadSourceId),
        event_type: eventType,
        occurred_at: occurredAt || new Date(),
        enrollment_id: enrollmentId || null,
        workflow_node_run_id: workflowNodeRunId || null,
        provider_message_id: providerMessageId || null,
        payload: payload || {},
        dedupe_key: dedupeKey || null,
      },
      transaction ? { transaction } : undefined
    );

    // Fire wake-up after the transaction commits so a rollback doesn't
    // resurrect waiters with no actual event row to find. Without a tx,
    // the row is already durable.
    const fire = () =>
      wakeWaiters({
        leadSourceType,
        leadSourceId,
        eventType,
      }).catch((err) =>
        console.error("wakeWaiters (post-event) failed:", err.message)
      );
    if (transaction) transaction.afterCommit(fire);
    else fire();

    return row;
  } catch (err) {
    // Unique-violation on dedupe_key is the expected "already-recorded" path.
    if (err?.name === "SequelizeUniqueConstraintError") return null;
    console.error("recordLeadEvent failed:", err.message);
    return null;
  }
}

module.exports = { recordLeadEvent };
