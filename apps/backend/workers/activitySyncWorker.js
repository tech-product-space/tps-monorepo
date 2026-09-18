"use strict";

const { Op } = require("sequelize");
const { Worker } = require("bullmq");
const { createRedisConnection } = require("../config/redis");
const { QUEUE_NAMES } = require("../queues/activityQueues");
const { VisitorActivity } = require("../models");
const { sendActivityBatch, isEnabled } = require("../service/crm/websiteActivity");
const { startDrainer } = require("../service/visitorActivity/drainer");

/**
 * Ships buffered page views to the CRM.
 *
 * Registered inside the existing worker process rather than being a new one to
 * deploy — see workers/workflowWorker.js, which requires this.
 *
 * The job carries only ids. Rows are re-read here, and only the unsynced ones
 * are sent, so:
 *
 *   - a job that waited out a retry cycle cannot ship a stale copy of a row
 *   - a row the hourly sweep already shipped is skipped rather than sent twice
 *   - a job whose rows have all since synced costs one indexed query and exits
 *
 * Errors are rethrown on purpose. That is the whole point of running this behind
 * a queue: BullMQ backs off and tries again, and until it succeeds `crmSyncedAt`
 * stays null so the sweep can pick the rows up regardless.
 */

const CONCURRENCY = parseInt(process.env.ACTIVITY_SYNC_CONCURRENCY || "2", 10);

async function syncHandler(job) {
  const { ids } = job.data;
  if (!ids?.length) return { sent: 0 };

  const rows = await VisitorActivity.findAll({
    // `phone: { [Op.ne]: null }` is load-bearing, not defensive. Anonymous page
    // views must never reach the CRM: it stores them keyed on this id with
    // ON CONFLICT DO NOTHING, so a row delivered without a phone could never be
    // corrected once the visitor identifies themselves — the second delivery
    // would be silently discarded and their history would stay orphaned.
    where: { id: { [Op.in]: ids }, crmSyncedAt: null, phone: { [Op.ne]: null } },
    order: [["occurredAt", "ASC"]],
  });

  if (!rows.length) return { sent: 0, note: "already synced or not yet identified" };

  const result = await sendActivityBatch(rows);

  // Only now, and only for what we actually sent.
  await VisitorActivity.update(
    { crmSyncedAt: new Date() },
    { where: { id: { [Op.in]: rows.map((r) => r.id) } } },
  );

  return { sent: rows.length, crm: result };
}

function startActivitySyncWorker() {
  if (!isEnabled()) {
    console.log("🔴 Activity CRM sync disabled by ENV");
    // The drainer still runs: page views are recorded locally even when they are
    // not being forwarded, so switching the CRM on later loses no history.
    startDrainer();
    return null;
  }

  const worker = new Worker(QUEUE_NAMES.CRM_SYNC, syncHandler, {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY,
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[activity.crm-sync] job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
      err?.response?.status || err?.message,
    );
  });

  console.log(`🟢 Activity CRM sync worker started (concurrency ${CONCURRENCY})`);

  startDrainer();

  return worker;
}

module.exports = { startActivitySyncWorker, syncHandler };
