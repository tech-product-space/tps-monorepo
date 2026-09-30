"use strict";

const { SesEmailLog } = require("../../models");

/**
 * Estimated cost for AWS SES:
 * - $0.10 per 1,000 emails ($0.0001 per email)
 * - $0.12 per GB of data attachments
 */
function calculateCost(payloadSizeBytes = 0) {
  const baseCost = 0.0001; // $0.10 / 1000
  const gigabytes = payloadSizeBytes / (1024 * 1024 * 1024);
  const dataCost = gigabytes * 0.12;
  return Number((baseCost + dataCost).toFixed(6));
}

/**
 * Fire-and-forget / awaited logger for AWS SES email dispatches.
 * Never throws or interrupts email sending.
 */
async function recordSesLog({
  to,
  subject,
  html,
  from,
  fromName,
  id,
  providerMessageId,
  status = "SENT",
  errorMessage = null,
  meta = {},
}) {
  try {
    if (!SesEmailLog) return null;

    const recipientEmail = Array.isArray(to) ? to.join(", ") : String(to || "").trim();
    if (!recipientEmail) return null;

    const senderEmail = (from || process.env.AWS_SES_FROM_MAIL || "noreply@theproductspace.in").trim();
    const payloadSizeBytes = typeof html === "string" ? Buffer.byteLength(html, "utf8") : 0;
    const estimatedCostUsd = calculateCost(payloadSizeBytes);

    const recordData = {
      message_id: providerMessageId ? String(providerMessageId).slice(0, 255) : null,
      correlation_id: id ? String(id).slice(0, 255) : null,
      source: String(meta?.source || "OTHER").toUpperCase().slice(0, 50),
      source_id: meta?.sourceId ? String(meta.sourceId).slice(0, 255) : null,
      source_name: meta?.sourceName ? String(meta.sourceName).slice(0, 255) : null,
      sender_email: senderEmail.slice(0, 255),
      sender_name: fromName ? String(fromName).slice(0, 255) : null,
      recipient_email: recipientEmail.slice(0, 500),
      subject: subject ? String(subject) : null,
      status: String(status || "SENT").toUpperCase(),
      error_message: errorMessage ? String(errorMessage).slice(0, 2000) : null,
      estimated_cost_usd: estimatedCostUsd,
      payload_size_bytes: payloadSizeBytes,
      metadata: meta?.extra || null,
    };

    try {
      return await SesEmailLog.create(recordData);
    } catch (createErr) {
      // Retry once after a brief delay if it's a transient connection/pool timeout
      if (createErr.name === "SequelizeConnectionError" || createErr.name === "TimeoutError") {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return await SesEmailLog.create(recordData);
      }
      throw createErr;
    }
  } catch (err) {
    // Non-blocking logging failure
    console.error("⚠️ Failed to record SesEmailLog:", err.message);
    return null;
  }
}

/**
 * Updates status on bounce or complaint from SNS webhook.
 */
async function updateStatusOnWebhook({ correlationId, messageId, status, errorMessage }) {
  try {
    if (!SesEmailLog) return;

    const where = {};
    if (correlationId) {
      where.correlation_id = correlationId;
    } else if (messageId) {
      where.message_id = messageId;
    } else {
      return;
    }

    await SesEmailLog.update(
      {
        status,
        error_message: errorMessage || null,
      },
      { where }
    );
  } catch (err) {
    console.error("⚠️ Failed to update SesEmailLog status:", err.message);
  }
}

module.exports = {
  recordSesLog,
  updateStatusOnWebhook,
};
