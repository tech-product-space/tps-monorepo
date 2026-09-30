"use strict";

const { getSharedRedis } = require("../../config/redis");

/**
 * "Am I allowed to raise an alert for this visitor right now?"
 *
 * The rule is unchanged: one alert per visitor per 8 hours. What changes is that
 * the check and the claim happen in a single atomic step.
 *
 * The old code read `notifiedAt`, decided, and wrote it back:
 *
 *     if (now - notifiedAt < 8h) return;   // read
 *     ...
 *     visitor.notifiedAt = new Date();     // write
 *
 * Two page views milliseconds apart both pass the read before either writes, and
 * both raise an alert. That is not theoretical — production rows 78456 and 78457
 * are the same person on the same page, four milliseconds apart.
 *
 * `SET key NX EX` closes it: Redis either gives you the key or it does not, and
 * only one caller can win. This is the same "frequency cap" pattern the shared
 * client was added for.
 *
 * Two safeguards around it:
 *
 *   - `notifiedAt` in Postgres is still the durable record, and is checked first.
 *     A Redis restart empties every key; without this, every visitor would be
 *     eligible again at once and the feed would flood.
 *
 *   - If Redis itself is unreachable we fall back to the old comparison. That
 *     restores the old race, which is rare and merely noisy — far better than
 *     refusing to alert at all, or than blocking the request on a dead service.
 */

const COOLDOWN_MS = 8 * 60 * 60 * 1000;
const COOLDOWN_SECONDS = COOLDOWN_MS / 1000;

// This is the one Redis call the request path actually waits on, so it needs a
// ceiling. ioredis retries a command up to 20 times before giving up, which with
// Redis down means every page view stalls for seconds before falling back — the
// visitor pays for our outage. 200ms is far more than a healthy Redis needs and
// far less than anyone notices.
const REDIS_TIMEOUT_MS = 200;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`redis timeout after ${ms}ms`)), ms).unref?.(),
    ),
  ]);

/**
 * @param {string} visitorId
 * @param {Date|string|null} notifiedAt  the visitor's durable last-alert time
 * @returns {Promise<boolean>} true when this caller may raise the alert
 */
async function claimNotifySlot(visitorId, notifiedAt) {
  // The durable record wins. Survives a Redis flush.
  if (notifiedAt) {
    const since = Date.now() - new Date(notifiedAt).getTime();
    if (since < COOLDOWN_MS) return false;
  }

  try {
    const won = await withTimeout(
      getSharedRedis().set(
        `visitor:notified:${visitorId}`,
        "1",
        "EX",
        COOLDOWN_SECONDS,
        "NX",
      ),
      REDIS_TIMEOUT_MS,
    );
    return won === "OK";
  } catch (err) {
    // Redis down: fall back to what the database already told us above, which is
    // exactly the behaviour that shipped before this existed.
    console.error("[activity] notify-slot check degraded to DB only:", err.message);
    return true;
  }
}

module.exports = { claimNotifySlot, COOLDOWN_MS };
