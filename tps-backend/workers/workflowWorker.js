"use strict";

require("dotenv").config();

const { Worker } = require("bullmq");
const sequelize = require("../config/db");
require("../models"); // ensures associations are loaded
const { createRedisConnection, REDIS_HOST, REDIS_PORT } = require("../config/redis");
const { QUEUE_NAMES } = require("../queues/workflowQueues");
const { advanceEnrollment } = require("../service/workflow/engine/advanceEnrollment");
const { runBulkEnroll } = require("../service/workflow/publish/enrollBulk");
const { evaluateTriggers } = require("../service/workflow/engine/triggerEvaluator");
const { WorkflowEnrollment } = require("../models");
const { ENROLLMENT_STATUS } = require("../constants/workflow");
require("../jobs/workflowReconcileCron"); // registers the reconcile cron
const { startActivitySyncWorker } = require("./activitySyncWorker");
const { stopDrainer } = require("../service/visitorActivity/drainer");

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "10", 10);

async function advanceHandler(job) {
  try {
    const result = await advanceEnrollment(job);
    if (process.env.DEBUG_WORKFLOW === "1") {
      console.log(`[workflow.advance] ${job.id} →`, JSON.stringify(result));
    }
    return result;
  } catch (err) {
    // retryable errors are rethrown so BullMQ retries with backoff
    if (err.retryable) throw err;
    console.error(`[workflow.advance] ${job.id} fatal:`, err.message);
    throw err;
  }
}

async function bulkEnrollHandler(job) {
  try {
    const result = await runBulkEnroll(job);
    console.log(
      `[workflow.bulk-enroll] ${job.id} →`,
      JSON.stringify(result)
    );
    return result;
  } catch (err) {
    console.error(`[workflow.bulk-enroll] ${job.id} error:`, err.message);
    throw err;
  }
}

async function evaluateTriggersHandler(job) {
  try {
    const result = await evaluateTriggers(job);
    // Always log so admins can see why a trigger didn't fire (no candidate
    // workflows, filter mismatch, in-flight dedupe, cap reached, etc).
    const { source_type, source_id } = job.data || {};
    console.log(
      `[workflow.evaluate-triggers] ${job.id} src=${source_type}:${source_id} →`,
      JSON.stringify(result)
    );
    return result;
  } catch (err) {
    console.error(
      `[workflow.evaluate-triggers] ${job.id} error:`,
      err.message
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------

(async () => {
  try {
    await sequelize.authenticate();
    console.log("[worker] Postgres connection ok");

    const advanceWorker = new Worker(QUEUE_NAMES.ADVANCE, advanceHandler, {
      connection: createRedisConnection(),
      concurrency: CONCURRENCY,
    });

    const bulkEnrollWorker = new Worker(
      QUEUE_NAMES.BULK_ENROLL,
      bulkEnrollHandler,
      {
        connection: createRedisConnection(),
        concurrency: 2,
      }
    );

    const evaluateTriggersWorker = new Worker(
      QUEUE_NAMES.EVALUATE_TRIGGERS,
      evaluateTriggersHandler,
      {
        connection: createRedisConnection(),
        // Trigger evaluation is mostly DB-bound; modest concurrency is fine.
        concurrency: parseInt(
          process.env.EVAL_TRIGGER_CONCURRENCY || "5",
          10
        ),
      }
    );

    advanceWorker.on("error", (err) =>
      console.error("[workflow.advance] worker error:", err.message)
    );
    bulkEnrollWorker.on("error", (err) =>
      console.error("[workflow.bulk-enroll] worker error:", err.message)
    );
    evaluateTriggersWorker.on("error", (err) =>
      console.error("[workflow.evaluate-triggers] worker error:", err.message)
    );

    // When BullMQ exhausts all retry attempts, mark the enrollment as failed
    // so it doesn't sit silently active forever.
    //
    // We deliberately ignore 'workflow_paused' here — that's expected during
    // pauses; the reconcile cron (Day 4) will re-enqueue once the workflow
    // resumes.
    advanceWorker.on("failed", async (job, err) => {
      if (!job) return;
      if (err && err.message === "workflow_paused") return;

      const attemptsMade = job.attemptsMade || 0;
      const maxAttempts = (job.opts && job.opts.attempts) || 1;
      if (attemptsMade < maxAttempts) return; // BullMQ will retry

      const enrollmentId = job.data && job.data.enrollment_id;
      if (!enrollmentId) return;

      try {
        await WorkflowEnrollment.update(
          {
            status: ENROLLMENT_STATUS.FAILED,
            completed_at: new Date(),
            error_reason: `retries_exhausted: ${(err && err.message ? err.message : "unknown").slice(0, 500)}`,
          },
          {
            where: {
              id: enrollmentId,
              status: ENROLLMENT_STATUS.ACTIVE,
            },
          }
        );
        console.error(
          `[workflow.advance] enr=${enrollmentId} retries exhausted: ${err && err.message}`
        );
      } catch (e) {
        console.error(
          "[workflow.advance] failed listener error:",
          e.message
        );
      }
    });

    // Visitor page views: drains the Redis buffer into Postgres and ships it to
    // the CRM. Lives here rather than in its own process so there is nothing new
    // to deploy, and so exactly one drainer runs — see the drainer's lock note.
    const activitySyncWorker = startActivitySyncWorker();

    console.log(
      `[worker] booted | redis=${REDIS_HOST}:${REDIS_PORT} | advance.concurrency=${CONCURRENCY}`
    );

    const shutdown = async (signal) => {
      console.log(`[worker] ${signal} received, draining...`);
      stopDrainer();
      await Promise.all([
        advanceWorker.close(),
        bulkEnrollWorker.close(),
        evaluateTriggersWorker.close(),
        ...(activitySyncWorker ? [activitySyncWorker.close()] : []),
      ]);
      await sequelize.close();
      process.exit(0);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("[worker] boot failed:", err);
    process.exit(1);
  }
})();
