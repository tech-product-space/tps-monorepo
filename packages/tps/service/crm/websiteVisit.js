const psEnv = require("@ps/env/tps");
const crypto = require("crypto");
const axios = require("axios");

/**
 * Sends a flagged visitor notification to the CRM, where it becomes a lead under
 * the "Website Visitors" product.
 *
 * Two rules govern everything here:
 *
 * 1. **Never block the visitor.** This runs inside the request that a person's
 *    browser made while they were reading a page. If the CRM is slow, down, or
 *    mid-deploy, that must be completely invisible to them — so nothing here is
 *    awaited by the caller, and every failure is swallowed after logging. The
 *    hourly catch-up is what makes losing one survivable.
 *
 * 2. **Send the record id.** The CRM refuses anything it has already stored, keyed
 *    on this id. That is what lets the live send and the catch-up both carry the
 *    same visit without producing two history entries and two lead bumps.
 *
 * The signature is an HMAC over the exact bytes we send, so the CRM can verify it
 * byte-for-byte rather than re-serialising and hoping key order survives.
 */

const isEnabled = () =>
  psEnv.CRM_WEBSITE_VISIT_ENABLED === "true" &&
  !!psEnv.CRM_URL &&
  !!psEnv.CRM_WEBSITE_VISIT_SECRET;

/**
 * @param {object} entry a VisitorNotificationHistory row (or plain equivalent)
 * @returns {Promise<boolean>} true when the CRM accepted it
 */
async function sendVisitToCRM(entry) {
  if (!isEnabled()) return false;

  const body = JSON.stringify({
    source_event_id: String(entry.id),
    visitor_id: entry.visitorId,
    name: entry.name || null,
    email: entry.email || null,
    phone: entry.phone || null,
    page_url: entry.page || null,
    occurred_at: entry.timestamp || new Date().toISOString(),
  });

  const signature = crypto
    .createHmac("sha256", psEnv.CRM_WEBSITE_VISIT_SECRET)
    .update(body)
    .digest("hex");

  await axios.post(
    `${psEnv.CRM_URL.replace(/\/+$/, "")}/api/v1/webhooks/website-visit`,
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "x-website-visit-signature": `sha256=${signature}`,
      },
      // Short on purpose. A CRM taking longer than this is a CRM we should give
      // up on and let the catch-up handle, not one we keep a connection open for.
      timeout: 5000,
    },
  );

  return true;
}

/**
 * Fire-and-forget wrapper for the live path. Deliberately returns nothing and
 * never rejects — see rule 1 above.
 */
function sendVisitToCRMInBackground(entry) {
  if (!isEnabled()) return;

  sendVisitToCRM(entry).catch((err) => {
    console.error(
      `CRM website-visit send failed (notification ${entry?.id}):`,
      err.response?.status || err.message,
    );
  });
}

module.exports = { sendVisitToCRM, sendVisitToCRMInBackground, isEnabled };
