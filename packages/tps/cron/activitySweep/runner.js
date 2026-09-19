"use strict";

const { Op } = require("sequelize");
const { VisitorActivity } = require("../../models");
const { enqueueCrmSync } = require("../../queues/activityQueues");
const { isEnabled } = require("../../service/crm/websiteActivity");

/**
 * The safety net under BullMQ.
 *
 * BullMQ retries a failing job, but there are failures it cannot retry through:
 * a job that exhausted its attempts, a Redis flush that lost the queue, a drain
 * that inserted rows and died before enqueuing anything.
 *
 * This asks the one question that covers all of them:
 *
 *     WHERE "crmSyncedAt" IS NULL
 *
 * which is a real improvement on the old catch-up's "anything from the last 3
 * hours" — that window silently gave up on anything older than itself. Nothing
 * can now fall outside it: a row that failed for two days is still picked up.
 *
 * Rows younger than a few minutes are left alone, so this never races the worker
 * that is very likely mid-flight with them.
 */

const MIN_AGE_MINUTES = 5;
const MAX_PER_RUN = 5000;
const CHUNK = 500;

async function runActivitySweep() {
  if (!isEnabled()) return;

  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000);

  try {
    const rows = await VisitorActivity.findAll({
      // Identified rows only. Anonymous browsing is unsynced by design and
      // always will be until a form claims it — sweeping it up would re-queue
      // thousands of rows every hour for the worker to discard.
      where: {
        crmSyncedAt: null,
        phone: { [Op.ne]: null },
        createdAt: { [Op.lt]: cutoff },
      },
      attributes: ["id"],
      order: [["createdAt", "ASC"]],
      limit: MAX_PER_RUN,
    });

    if (!rows.length) return;

    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      await enqueueCrmSync(ids.slice(i, i + CHUNK));
    }

    console.log(`🔁 Activity sweep: re-queued ${ids.length} unsynced page views`);
  } catch (err) {
    console.error("Activity sweep failed:", err.message);
  }
}

module.exports = { runActivitySweep };
