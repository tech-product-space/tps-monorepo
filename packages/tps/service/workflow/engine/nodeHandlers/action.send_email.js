"use strict";

const { dispatchEmail } = require("../../dispatchers/emailDispatcher");
const { interpolate, buildScope } = require("../utils/interpolate");
const { recordLeadEvent } = require("../../events/recordLeadEvent");
const { LEAD_EVENT_TYPE } = require("../../../../constants/workflow");

/**
 * Send-email node handler.
 *
 * Returns:
 *   { outcome: 'next' }            on successful send
 *   { outcome: 'cancel', reason }  if lead is opted out
 *   { outcome: 'skip',   reason }  if recipient address is missing
 *   throws (retryable=true)        on transient provider failure
 */
exports.execute = async ({ enrollment, node, workflow, nodeRun, tx }) => {
  const scope = buildScope(enrollment);
  const subject = interpolate(node.config.subject, scope);
  const html = interpolate(node.config.html_body, scope);

  const result = await dispatchEmail({
    to: enrollment.lead_email_snapshot,
    subject,
    html,
    from: node.config.from_email,
    fromName: node.config.from_name,
    leadSourceType: enrollment.lead_source_type,
    leadSourceId: enrollment.lead_source_id,
    workflowSettings: workflow?.settings,
    enrollmentId: enrollment.id,
    nodeRunId: nodeRun?.id,
  });

  if (result.outcome === "sent") {
    // Record the email.sent event AFTER the workflow transaction commits.
    // Doing it inside the same transaction would mean a failed insert (e.g.
    // table missing, unique constraint glitch) corrupts the parent tx and
    // takes the whole workflow advance down with it.
    if (tx && typeof tx.afterCommit === "function") {
      tx.afterCommit(() => {
        recordLeadEvent({
          leadSourceType: enrollment.lead_source_type,
          leadSourceId: enrollment.lead_source_id,
          eventType: LEAD_EVENT_TYPE.EMAIL_SENT,
          enrollmentId: enrollment.id,
          workflowNodeRunId: nodeRun?.id,
          providerMessageId: result.providerMessageId,
          payload: {
            to: enrollment.lead_email_snapshot,
            subject,
            from: node.config.from_email,
            provider_native_id: result.providerNativeId || null,
          },
          dedupeKey: `sent:${result.providerMessageId}`,
        }).catch((err) =>
          console.error("post-send recordLeadEvent failed:", err.message)
        );
      });
    }

    return {
      outcome: "next",
      provider_message_id: result.providerMessageId,
      output: {
        to: enrollment.lead_email_snapshot,
        subject,
        from: node.config.from_email,
        provider_native_id: result.providerNativeId || null,
      },
    };
  }

  if (result.outcome === "opted_out") {
    return { outcome: "cancel", reason: "lead_opted_out_email" };
  }

  if (result.outcome === "no_email") {
    return { outcome: "skip", reason: "no_recipient_email" };
  }

  const err = new Error(`email_send_failed: ${result.reason || "unknown"}`);
  err.retryable = true;
  throw err;
};
