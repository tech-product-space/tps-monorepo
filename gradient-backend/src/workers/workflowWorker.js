import { Worker } from "bullmq";

import env from "../config/env.js";
import {
  QUEUE_NAMES,
  getRedisConnection,
  closeQueues,
} from "../queues/workflowQueues.js";
import { evaluateTriggers } from "./handlers/evaluateTriggers.js";
import { advanceEnrollment } from "./handlers/advanceEnrollment.js";
import { runBulkEnroll } from "./handlers/bulkEnroll.js";
import { reconcileEnrollments } from "./reconcile.js";
import logger from "../util/logger.js";

/**
 * The three workers, plus the reconcile cron and a heartbeat.
 *
 * Runs in its own process (`src/worker.js`), never inside the API — a long
 * journey step must not compete with a page load for the same event loop.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §10.
 */

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * The key `/workflows/admin/health` reads to answer "is a worker alive?".
 *
 * **Namespaced by the queue prefix, like the queues themselves.** It was not,
 * and that is worse than the unprefixed queues it sat next to: two environments
 * sharing one Redis would share one heartbeat, so staging's worker would make
 * production's health banner read "Workflows are running" while production's
 * worker was dead. A health check that fails towards "everything is fine" is
 * the one direction it must never fail in.
 */
export const HEARTBEAT_KEY = `${env.workflows.queuePrefix}:workflow:worker:heartbeat`;

let workers = [];
let timers = [];

const register = (name, handler, { concurrency }) => {
  const worker = new Worker(name, handler, {
    connection: getRedisConnection(),
    prefix: env.workflows.queuePrefix,
    concurrency,
  });

  worker.on("failed", (job, error) => {
    logger.error(`[${name}] job failed`, {
      jobId: job?.id,
      attempt: job?.attemptsMade,
      data: job?.data,
      error: error?.message,
    });
  });

  // Logged rather than fatal: ioredis reconnects, and a worker that exits on a
  // transient blip is a worker that is not running when Redis comes back.
  worker.on("error", (error) => {
    logger.error(`[${name}] worker error`, { error: error.message });
  });

  workers.push(worker);

  return worker;
};

export const startWorkflowWorkers = () => {
  if (!env.workflows.enabled) {
    logger.warn(
      "🟡 Workflow workers disabled (WORKFLOWS_ENABLED is not true). " +
        "Workflows will accept publishes and enrol nobody.",
    );
    return { started: false };
  }

  const { concurrency } = env.workflows;

  register(QUEUE_NAMES.EVALUATE_TRIGGERS, evaluateTriggers, { concurrency });

  /**
   * Advance carries the sends, so its concurrency is the one that meets SES.
   *
   * Five workers sending flat out is five times the rate the single-threaded
   * campaign job was tuned for. Keep this low, or move the send interval into a
   * shared limiter — do not leave it implicit.
   */
  register(QUEUE_NAMES.ADVANCE, advanceEnrollment, { concurrency });

  // One at a time: two Runs of the same workflow queue up instead of racing
  // each other into the unique index.
  register(QUEUE_NAMES.BULK_ENROLL, runBulkEnroll, { concurrency: 1 });

  /* ── reconcile ── */
  const reconcileTimer = setInterval(() => {
    reconcileEnrollments().catch((error) =>
      logger.error("Reconcile pass failed", { error: error.message }),
    );
  }, RECONCILE_INTERVAL_MS);

  // One pass at boot: a deploy is exactly when jobs go missing, so waiting five
  // minutes to find out is five minutes of a stranded journey.
  reconcileEnrollments().catch((error) =>
    logger.error("Initial reconcile failed", { error: error.message }),
  );

  /* ── heartbeat ── */
  const connection = getRedisConnection();

  const beat = () =>
    connection
      // Expires at three times the interval, so a missed beat or two is not a
      // false alarm but a dead worker shows up within a couple of minutes.
      .set(HEARTBEAT_KEY, String(Date.now()), "EX", 90)
      .catch((error) =>
        logger.warn("Heartbeat failed", { error: error.message }),
      );

  beat();
  const heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

  timers = [reconcileTimer, heartbeatTimer];

  logger.info("🟢 Workflow workers started", {
    prefix: env.workflows.queuePrefix,
    concurrency,
  });

  return { started: true };
};

/**
 * Stops consuming, then waits for in-flight jobs.
 *
 * `worker.close()` lets a job that is mid-send finish rather than killing it —
 * an interrupted send is the one thing that turns a deploy into a duplicate
 * email on redelivery.
 */
export const stopWorkflowWorkers = async () => {
  timers.forEach(clearInterval);
  timers = [];

  await Promise.all(workers.map((w) => w.close()));
  workers = [];

  await closeQueues();

  logger.info("Workflow workers stopped");
};
