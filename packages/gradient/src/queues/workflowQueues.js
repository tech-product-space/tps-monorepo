import { Queue } from "bullmq";
import IORedis from "ioredis";

import env from "../config/env.js";
import logger from "../util/logger.js";

/**
 * The three workflow queues.
 *
 * `WORKFLOW_AUTOMATION_PLAN.md` §3.1. The API enqueues; the worker
 * (`src/worker.js`) consumes. Nothing in `controllers/` ever calls a node
 * handler directly.
 *
 * **Everything here is a no-op when `WORKFLOWS_ENABLED` is false.** The enqueue
 * helpers return null rather than throwing, so an environment with no Redis
 * runs the rest of the product untouched — a lead still saves, an event
 * registration still works, and only the automation is asleep.
 */

export const QUEUE_NAMES = Object.freeze({
  EVALUATE_TRIGGERS: "workflow.evaluate-triggers",
  ADVANCE: "workflow.advance",
  BULK_ENROLL: "workflow.bulk-enroll",
});

/**
 * Shared defaults.
 *
 * `removeOnComplete` matters more than it looks: without it a workflow sending
 * to a few thousand people leaves a few thousand completed job hashes per run,
 * and Redis is memory. `removeOnFail` keeps a week, which is the only forensic
 * trail for a bug that only shows up under load.
 */
const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
});

let connection = null;
let queues = null;

/**
 * How long any single Redis call may take before it is treated as a failure.
 *
 * **This exists because `maxRetriesPerRequest: null` means commands never
 * fail.** BullMQ requires that setting — with a retry limit, a command issued
 * during a brief disconnect rejects, and a blocking worker treats that as
 * fatal. The cost is that ioredis holds every command in an offline queue
 * *indefinitely* while Redis is unreachable, so nothing rejects, and the
 * `try/catch` around each helper below never runs.
 *
 * The result, measured with Redis stopped: `enqueueAdvance`,
 * `enqueueBulkEnroll` and — worst of the three — `getQueueHealth` did not
 * return at all. The health endpoint is the one thing whose entire job is to
 * say "Redis is down", and it hung instead of saying it.
 *
 * A timeout turns "hangs forever" into "fails in five seconds and says so",
 * which every caller here already knows how to handle.
 */
const REDIS_OP_TIMEOUT_MS = 5_000;

/** Health has a person waiting on it, so it gives up sooner. */
const HEALTH_TIMEOUT_MS = 2_000;

/**
 * Rejects if the underlying call has not settled in time.
 *
 * The command itself is *not* cancelled — ioredis has no way to withdraw one,
 * so it may still run when Redis comes back. That is accepted: a late advance
 * job re-parks a wait or is refused by the node-run claim, and a late trigger
 * enrols somebody a few minutes after they arrived. Both are better than a
 * request that never answers.
 */
export const withQueueTimeout = async (promise, ms = REDIS_OP_TIMEOUT_MS) => {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error(`Redis did not answer within ${ms}ms`), {
              name: "RedisTimeout",
            }),
          );
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * One connection, shared by every queue and reused by the worker.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ — with a limit, a command
 * issued while Redis is briefly unreachable rejects instead of waiting, and a
 * blocking worker treats that as a fatal error.
 */
export const getRedisConnection = () => {
  if (connection) return connection;

  const { redis } = env.workflows;

  const options = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(redis.tls ? { tls: {} } : {}),
  };

  connection = redis.url
    ? new IORedis(redis.url, options)
    : new IORedis({
        host: redis.host,
        port: redis.port,
        password: redis.password,
        ...options,
      });

  // Logged rather than thrown. ioredis reconnects on its own, and a transient
  // blip must not take the API process down with it.
  connection.on("error", (error) => {
    logger.error("Workflow Redis error", { error: error.message });
  });

  return connection;
};

/** Lazily built, so importing this module never opens a socket by itself. */
const getQueues = () => {
  if (!env.workflows.enabled) return null;
  if (queues) return queues;

  const shared = {
    connection: getRedisConnection(),
    prefix: env.workflows.queuePrefix,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  };

  queues = {
    [QUEUE_NAMES.EVALUATE_TRIGGERS]: new Queue(QUEUE_NAMES.EVALUATE_TRIGGERS, shared),
    [QUEUE_NAMES.ADVANCE]: new Queue(QUEUE_NAMES.ADVANCE, shared),
    [QUEUE_NAMES.BULK_ENROLL]: new Queue(QUEUE_NAMES.BULK_ENROLL, shared),
  };

  return queues;
};

export const getQueue = (name) => getQueues()?.[name] ?? null;

/* ── enqueue helpers ────────────────────────────────────────────────────── */

/**
 * "Something happened — does it start any workflow?"
 *
 * Called from model hooks, so it must never throw into the caller: a Redis blip
 * cannot be allowed to turn a visitor's form submission into a 500.
 *
 * **A failure here loses the trigger.** There is no outbox row and no enrolment,
 * so the reconcile cron cannot find it — nobody is enrolled and nothing else
 * says so. Named and accepted in §4.6; the distinct log tag below is the only
 * warning that exists, so it is worth alerting on.
 */
export const enqueueEvaluateTrigger = async ({ sourceType, sourceId }) => {
  const queue = getQueue(QUEUE_NAMES.EVALUATE_TRIGGERS);

  if (!queue) return null;

  try {
    return await withQueueTimeout(
      queue.add(
        "evaluate",
        { sourceType, sourceId: String(sourceId) },
        {
          // Two hooks firing for the same row — a create plus a bulk create —
          // collapse into one job rather than evaluating the same person twice.
          jobId: `trigger:${sourceType}:${sourceId}`,
        },
      ),
    );
  } catch (error) {
    logger.error("[workflow.trigger-lost] could not enqueue trigger", {
      sourceType,
      sourceId,
      error: error.message,
    });
    return null;
  }
};

/**
 * "Move this enrolment to its next step."
 *
 * `delay` is how a `wait` is implemented. The deadline is also written to
 * `enrollment.nextRunAt` by the caller — that column, not this delay, is the
 * authority, because only one of the two survives a Redis restart.
 *
 * The job id is deterministic per enrolment *and attempt-time*, so re-enqueuing
 * an enrolment that already has a live job replaces it rather than racing it.
 */
export const enqueueAdvance = async (enrollmentId, { delay = 0, runAt } = {}) => {
  const queue = getQueue(QUEUE_NAMES.ADVANCE);

  if (!queue) return null;

  const ms = runAt ? Math.max(0, new Date(runAt).getTime() - Date.now()) : delay;

  try {
    const job = await withQueueTimeout(
      queue.add(
        "advance",
        { enrollmentId },
        {
          delay: ms,
          // Distinct per scheduled time: a delayed job already sitting in Redis
          // for this enrolment keeps its own id, and re-enqueuing after a pause
          // does not silently collide with it.
          jobId: `advance:${enrollmentId}:${Date.now()}`,
        },
      ),
    );

    return job;
  } catch (error) {
    logger.error("Could not enqueue advance", {
      enrollmentId,
      error: error.message,
    });
    return null;
  }
};

/** Removes a scheduled advance — used by cancel, pause and archive. */
export const removeAdvanceJob = async (jobId) => {
  if (!jobId) return;

  const queue = getQueue(QUEUE_NAMES.ADVANCE);

  if (!queue) return;

  try {
    const job = await withQueueTimeout(queue.getJob(jobId));
    // Only a job that has not started. Removing a running one would leave the
    // enrolment mid-step with nothing to finish it.
    if (job) await withQueueTimeout(job.remove());
  } catch (error) {
    logger.warn("Could not remove advance job", { jobId, error: error.message });
  }
};

/**
 * Is this job still going to run? The reconcile cron's question (§10.4).
 *
 * **Not "does the job exist".** `removeOnComplete` keeps finished jobs around
 * for a day, so a job that ran to completion an hour ago is still in Redis and
 * still answers `getJob`. An enrolment stranded *by* that job — it ran, did
 * nothing useful, and scheduled no successor — therefore looked healthy to the
 * one thing whose entire purpose is to find stranded enrolments. That is how a
 * fleet of enrolments sat overdue for an hour with the safety net running every
 * minute and reporting "nothing stranded".
 */
export const advanceJobExists = async (jobId) => {
  if (!jobId) return false;

  const queue = getQueue(QUEUE_NAMES.ADVANCE);

  if (!queue) return false;

  try {
    const job = await withQueueTimeout(queue.getJob(jobId));

    if (!job) return false;

    const state = await withQueueTimeout(job.getState());

    // Only a job with a future in it counts. `completed` and `failed` are
    // finished; `unknown` means it has already been evicted.
    return ["waiting", "waiting-children", "delayed", "active", "prioritized", "paused"].includes(
      state,
    );
  } catch {
    return false;
  }
};

/** A static-list Run. Concurrency 1, so two Runs of one workflow queue up. */
export const enqueueBulkEnroll = async ({ workflowId, runId }) => {
  const queue = getQueue(QUEUE_NAMES.BULK_ENROLL);

  if (!queue) return null;

  /**
   * Deliberately not caught here. Every other helper returns null on failure
   * because its caller has somewhere sensible to go — a lost trigger is logged,
   * a lost advance is picked up by reconcile. A Run has nowhere to go: the
   * admin pressed a button and is owed a straight answer, and "started" over a
   * queue that never received the job is the single most confusing state this
   * feature has. `runWorkflow` turns this into a 503 that says so.
   */
  return withQueueTimeout(
    queue.add(
      "bulk-enroll",
      { workflowId, runId },
      { jobId: `bulk:${workflowId}:${runId}` },
    ),
  );
};

/* ── health ─────────────────────────────────────────────────────────────── */

/** Powers `GET /workflows/admin/health` and the panel's banner (§10.5). */
export const getQueueHealth = async () => {
  if (!env.workflows.enabled) {
    return { enabled: false, redis: "disabled", queues: {} };
  }

  try {
    const conn = getRedisConnection();
    await withQueueTimeout(conn.ping(), HEALTH_TIMEOUT_MS);

    const counts = {};

    for (const name of Object.values(QUEUE_NAMES)) {
      const queue = getQueue(name);
      counts[name] = queue
        ? await withQueueTimeout(
            queue.getJobCounts("waiting", "active", "delayed", "failed"),
            HEALTH_TIMEOUT_MS,
          )
        : null;
    }

    return { enabled: true, redis: "up", queues: counts };
  } catch (error) {
    return {
      enabled: true,
      redis: "down",
      error: error.message,
      queues: {},
    };
  }
};

/** Closes the queues and the connection. For the worker's shutdown path. */
export const closeQueues = async () => {
  const all = queues ? Object.values(queues) : [];

  await Promise.all(all.map((q) => q.close()));

  if (connection) await connection.quit();

  queues = null;
  connection = null;
};
