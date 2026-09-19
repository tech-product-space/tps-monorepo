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

let tableChecked = false;
async function ensureTable() {
  if (!tableChecked && SesEmailLog) {
    try {
      await SesEmailLog.sync();
      tableChecked = true;
    } catch (e) {
      // ignore if already exists or permission issues
    }
  }
}

/**
 * Fire-and-forget logger for AWS SES email dispatches.
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
    if (!SesEmailLog) return;
    await ensureTable();

    const payloadSizeBytes = typeof html === "string" ? Buffer.byteLength(html, "utf8") : 0;
    const estimatedCostUsd = calculateCost(payloadSizeBytes);

    await SesEmailLog.create({
      message_id: providerMessageId || null,
      correlation_id: id || null,
      source: (meta?.source || "OTHER").toUpperCase(),
      source_id: meta?.sourceId ? String(meta.sourceId) : null,
      source_name: meta?.sourceName || null,
      sender_email: from,
      sender_name: fromName || null,
      recipient_email: to,
      subject: subject || null,
      status,
      error_message: errorMessage || null,
      estimated_cost_usd: estimatedCostUsd,
      payload_size_bytes: payloadSizeBytes,
      metadata: meta?.extra || null,
    });
  } catch (err) {
    // Non-blocking logging failure
    console.error("⚠️ Failed to record SesEmailLog:", err.message);
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
