"use strict";

const crypto = require("crypto");
const { getSharedRedis } = require("../../config/redis");
const { VisitorActivity } = require("../../models");

/**
 * Where a page view goes the instant it happens.
 *
 * This runs inside the request a person's browser made while they were reading a
 * page, so it has exactly one hard rule: **it must never make that request
 * slower, and it must never make it fail.** Everything below follows from that.
 *
 * The happy path is one Redis command — RPUSH, around 0.1ms — and the row is
 * written to Postgres later, in blocks, by the drainer. That is what makes
 * recording *every* page view affordable rather than the one-in-five the 8-hour
 * cooldown currently lets through.
 *
 * Redis is an optimisation here, not a dependency. If it is down, misconfigured,
 * or simply not running yet, we fall back to writing the row directly. Slower,
 * but nothing is lost and the visitor still notices nothing. That is deliberate:
 * this can be deployed before Redis is confirmed in production, and a Redis
 * outage degrades throughput instead of dropping history.
 *
 * The id is generated HERE, not by the database. It travels to the CRM as the
 * primary key there, so a batch re-sent after a failure collides and is
 * discarded. Minting it at the last possible moment — during the insert — would
 * mean a retried row arrived with a new id and appeared twice.
 */

const BUFFER_KEY = "activity:buffer";

/**
 * @param {object} args
 * @param {string} args.visitorId
 * @param {string} args.pageUrl
 * @param {object|null} args.contact  latest VisitorContact — name/email/phone
 * @param {boolean} args.notified     did this view raise the alert
 * @returns {Promise<string|null>} the row id, or null if it could not be stored
 */
async function bufferPageView({ visitorId, pageUrl, contact = null, notified = false }) {
  const row = {
    id: crypto.randomUUID(),
    visitorId,
    type: "page_view",
    page: pageUrl,
    name: contact?.name || null,
    email: contact?.email || null,
    phone: contact?.phone || null,
    occurredAt: new Date().toISOString(),
    notified,
  };

  try {
    await getSharedRedis().rpush(BUFFER_KEY, JSON.stringify(row));
    return row.id;
  } catch (err) {
    // Redis unavailable. Write it straight through rather than lose it.
    console.error("[activity] buffer unavailable, writing direct:", err.message);
    try {
      await VisitorActivity.create(row);
      return row.id;
    } catch (dbErr) {
      // Both gone. Log and give up — a page view is not worth failing a page
      // load over, and the visitor must never see this.
      console.error("[activity] direct write failed:", dbErr.message);
      return null;
    }
  }
}

/**
 * Fire-and-forget wrapper for the request path. Returns nothing and never
 * rejects, so a caller cannot accidentally await it or blow up on it.
 */
function bufferPageViewInBackground(args) {
  bufferPageView(args).catch((err) => {
    console.error("[activity] buffer failed:", err.message);
  });
}

module.exports = { bufferPageView, bufferPageViewInBackground, BUFFER_KEY };
