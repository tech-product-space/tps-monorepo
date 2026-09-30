"use strict";

const { Queue } = require("bullmq");
const { createRedisConnection } = require("../config/redis");

/**
 * Shipping page views to the CRM.
 *
 * One job per BATCH, never per page view. A BullMQ job costs several Redis
 * commands and carries a fair amount of metadata; at hundreds of views a second
 * that would cost more than the work it schedules. Batches of a few hundred turn
 * that into a handful of jobs a second.
 *
 * Options mirror queues/workflowQueues.js rather than inventing new ones.
 * `attempts` is generous because the failure this is built for — the CRM
 * restarting or deploying — resolves itself in a minute or two, and the rows are
 * still marked unsynced until it does.
 */

const QUEUE_NAMES = Object.freeze({
  CRM_SYNC: "activity.crm-sync",
});

const CRM_SYNC_JOB_DEFAULTS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const activityCrmSyncQueue = new Queue(QUEUE_NAMES.CRM_SYNC, {
  connection: createRedisConnection(),
  defaultJobOptions: CRM_SYNC_JOB_DEFAULTS,
});

/**
 * @param {string[]} ids VisitorActivity ids to ship
 *
 * Only ids travel. The worker re-reads the rows, so a job that sits in the queue
 * through a retry cycle cannot ship a stale copy, and a row already synced by
 * the sweep in the meantime is skipped rather than sent twice.
 */
async function enqueueCrmSync(ids) {
  if (!ids?.length) return null;
  return activityCrmSyncQueue.add("sync", { ids });
}

module.exports = {
  QUEUE_NAMES,
  activityCrmSyncQueue,
  enqueueCrmSync,
};
