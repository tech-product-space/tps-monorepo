"use strict";

const psEnv = require("@ps/env/tps");
const crypto = require("crypto");
const axios = require("axios");

/**
 * Ships a batch of page views to the CRM, where they become a person's browsing
 * trail — not leads, not alerts, not anything an agent gets interrupted by.
 *
 * The bulk sibling of service/crm/websiteVisit.js, and deliberately different in
 * one way: that one is fire-and-forget inside a visitor's page request, so it
 * swallows every error. This one runs in a background worker with retries, so it
 * **throws** — that is how BullMQ knows to try again.
 *
 * Same shared secret and the same rule about it: the signature is an HMAC over
 * the exact bytes we send, so the CRM verifies it byte-for-byte instead of
 * re-serialising and hoping key order survives.
 *
 * The CRM keys these rows on the id we generate, so re-sending a batch after a
 * timeout is free rather than merely harmless — Postgres discards what it
 * already holds inside the same INSERT.
 */

const isEnabled = () =>
  psEnv.CRM_WEBSITE_VISIT_ENABLED === "true" &&
  !!psEnv.CRM_URL &&
  !!psEnv.CRM_WEBSITE_VISIT_SECRET;

/**
 * @param {Array<object>} rows VisitorActivity rows (model instances or plain)
 * @returns {Promise<{received:number, accepted:number, skipped:number, duplicates:number}>}
 * @throws on any non-2xx or network failure, so the caller retries
 */
async function sendActivityBatch(rows) {
  if (!isEnabled()) return { received: 0, accepted: 0, skipped: 0, duplicates: 0 };
  if (!rows?.length) return { received: 0, accepted: 0, skipped: 0, duplicates: 0 };

  const body = JSON.stringify({
    events: rows.map((r) => ({
      id: r.id,
      visitor_id: r.visitorId,
      name: r.name || null,
      email: r.email || null,
      phone: r.phone || null,
      page_url: r.page || null,
      type: r.type || "page_view",
      occurred_at: r.occurredAt,
      meta: r.meta || null,
    })),
  });

  const signature = crypto
    .createHmac("sha256", psEnv.CRM_WEBSITE_VISIT_SECRET)
    .update(body)
    .digest("hex");

  const res = await axios.post(
    `${psEnv.CRM_URL.replace(/\/+$/, "")}/api/v1/webhooks/website-activity`,
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "x-website-visit-signature": `sha256=${signature}`,
      },
      // Longer than the single-visit send's 5s: nobody is waiting on this, and a
      // few hundred rows is more work than one. Still bounded, so a hung CRM
      // fails the job and lets the backoff do its work rather than pinning a
      // worker slot indefinitely.
      timeout: 30_000,
      maxBodyLength: 10 * 1024 * 1024,
    },
  );

  return res.data ?? { received: rows.length, accepted: 0, skipped: 0, duplicates: 0 };
}

module.exports = { sendActivityBatch, isEnabled };
