"use strict";

const { v4: uuidv4 } = require("uuid");
const sendEmail = require("../../mail/sendEmail");
const { isEmailOptedOut } = require("../compliance/optOutGuard");
const { rewriteForTracking } = require("../tracking/rewriteForTracking");
const { mintUnsubscribeToken } = require("../tracking/unsubscribeToken");
const {
  cleanHtml,
  wrapEmailTemplate,
  wrapEmailTemplateWithUnsubscribe,
} = require("../../../utils/email/htmlHelpers");

/**
 * Dispatch an email for a workflow node. Wraps the existing service/mail/sendEmail
 * with opt-out enforcement, tracking pixel/link rewrite, and List-Unsubscribe.
 *
 * Returns one of:
 *   { outcome: "sent",     providerMessageId }
 *   { outcome: "opted_out" }
 *   { outcome: "no_email" }   — missing recipient address
 *   { outcome: "failed",   reason }
 *
 * Note: there is intentionally no per-day frequency cap here. Per-lead pacing
 * is now controlled by the active-workflow cap at ENROLLMENT time (a lead can
 * only be in N workflows concurrently), not at send time. That avoids the
 * old bug where legitimate drip sends inside a single workflow were skipped.
 *
 * Never throws under normal failure modes; the caller decides retry/cancel.
 */
async function dispatchEmail({
  to,
  subject,
  html,
  from,
  fromName,
  leadSourceType,
  leadSourceId,
  workflowSettings,
  enrollmentId,
  nodeRunId,
}) {
  if (!to || typeof to !== "string" || !to.includes("@")) {
    return { outcome: "no_email" };
  }

  if (await isEmailOptedOut(leadSourceType, leadSourceId, to)) {
    return { outcome: "opted_out" };
  }

  // Correlation id used for tracking pixel/link token + SES Tags / Graph headers.
  const messageId = uuidv4();

  // Normalize the authored HTML the same way the campaign pipeline does
  // (strips broken white-space/p tags, normalizes font-family) so workflow
  // emails render consistently with campaigns.
  const safeCleanHtml = (raw) => {
    try {
      return cleanHtml(raw || "");
    } catch (_) {
      return raw || "";
    }
  };
  // Convert authored newlines to <br>, exactly like the campaign pipeline does
  // via replacePlaceholders. Without this, the line breaks / paragraph spacing
  // the user sees in the editor (which renders newlines via white-space:pre-wrap)
  // collapse in the delivered email — because cleanHtml strips white-space:pre-wrap
  // and HTML otherwise collapses runs of whitespace.
  const cleanedHtml = safeCleanHtml(html).replace(/\n/g, "<br>");

  // Tracking runs on the authored content only — that keeps the wrapper's
  // unsubscribe link off the click-tracker and prevents an "engagement" event
  // every time someone clicks Unsubscribe.
  let trackedInner = cleanedHtml;
  let unsubscribeUrl = null;
  try {
    const rewriteResult = rewriteForTracking({
      html: cleanedHtml,
      messageId,
      leadSourceType,
      leadSourceId,
      enrollmentId,
      nodeRunId,
    });
    trackedInner = rewriteResult.html;

    const tok = mintUnsubscribeToken({ leadSourceType, leadSourceId, messageId });
    const base = (process.env.PUBLIC_TRACKING_BASE_URL || "").replace(/\/$/, "");
    if (base && tok) {
      unsubscribeUrl = `${base}/api/v1/u/${tok}`;
    }
  } catch (err) {
    // Tracking rewrite is best-effort — fall back to original html if anything blows up.
    console.error("rewriteForTracking failed:", err.message);
  }

  // Wrap with the shared product space email template (gray bg, white card,
  // branded footer) — same wrapper used by campaignScheduler.js. Falls back
  // to the no-unsubscribe variant if PUBLIC_TRACKING_BASE_URL isn't set.
  const trackedHtml = unsubscribeUrl
    ? wrapEmailTemplateWithUnsubscribe(trackedInner, unsubscribeUrl)
    : wrapEmailTemplate(trackedInner);

  const headers = [];
  if (unsubscribeUrl) {
    headers.push({ name: "List-Unsubscribe", value: `<${unsubscribeUrl}>` });
    headers.push({ name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" });
  }

  const out = {};
  let result;
  try {
    result = await sendEmail({
      to,
      subject,
      html: trackedHtml,
      from,
      fromName,
      id: messageId,
      headers,
      out,
    });
  } catch (err) {
    return { outcome: "failed", reason: err.message };
  }

  if (result !== "success") {
    return { outcome: "failed", reason: "provider_returned_failed" };
  }

  return {
    outcome: "sent",
    providerMessageId: messageId,
    providerNativeId: out.providerMessageId || null,
  };
}

module.exports = { dispatchEmail };
