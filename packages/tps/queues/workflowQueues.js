"use strict";

const { Queue } = require("bullmq");
const { createRedisConnection } = require("../config/redis");

const QUEUE_NAMES = Object.freeze({
  ADVANCE: "workflow.advance",
  BULK_ENROLL: "workflow.bulk-enroll",
  EVALUATE_TRIGGERS: "workflow.evaluate-triggers",
});

// Default job options used when enqueuing onto the advance queue
const ADVANCE_JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const BULK_ENROLL_JOB_DEFAULTS = {
  attempts: 2,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

const EVALUATE_TRIGGER_JOB_DEFAULTS = {
  // Tight retry budget — these jobs are cheap; if they fail consistently
  // the issue is structural and won't fix itself on retry.
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const workflowAdvanceQueue = new Queue(QUEUE_NAMES.ADVANCE, {
  connection: createRedisConnection(),
  defaultJobOptions: ADVANCE_JOB_DEFAULTS,
});

const workflowBulkEnrollQueue = new Queue(QUEUE_NAMES.BULK_ENROLL, {
  connection: createRedisConnection(),
  defaultJobOptions: BULK_ENROLL_JOB_DEFAULTS,
});

const workflowEvaluateTriggersQueue = new Queue(QUEUE_NAMES.EVALUATE_TRIGGERS, {
  connection: createRedisConnection(),
  defaultJobOptions: EVALUATE_TRIGGER_JOB_DEFAULTS,
});

/**
 * Enqueue an advance-enrollment job with a deterministic ID so duplicate
 * enqueues are no-ops.
 *
 * @param {object} args
 * @param {string} args.enrollmentId
 * @param {string} args.nodeId
 * @param {number} args.attempt          - default 1
 * @param {number} args.delayMs          - default 0
 */
async function enqueueAdvance({
  enrollmentId,
  nodeId,
  attempt = 1,
  delayMs = 0,
}) {
  const jobId = `${enrollmentId}:${nodeId}:${attempt}`;
  return workflowAdvanceQueue.add(
    "advance",
    { enrollment_id: enrollmentId, node_id: nodeId, expected_attempt: attempt },
    { jobId, delay: Math.max(0, delayMs) }
  );
}

async function enqueueBulkEnroll({ workflowId, runId }) {
  const jobId = `bulk:${workflowId}:${runId}`;
  return workflowBulkEnrollQueue.add(
    "bulk-enroll",
    { workflow_id: workflowId, run_id: runId },
    { jobId }
  );
}

/**
 * Enqueue an evaluate-trigger job for a newly created lead.
 *
 * Called from Sequelize afterCreate hooks. Must be non-blocking — if Redis is
 * down we log and continue; the parent insert should never fail because of
 * the workflow engine.
 *
 * Job IDs are NOT deterministic here. If the same lead arrives via two paths
 * (e.g. ExternalLead bulkCreate fires both afterCreate and afterBulkCreate),
 * we'd accept and process duplicates — the evaluator and unique constraints
 * on workflow_enrollments handle dedup at the data layer.
 */
async function enqueueEvaluateTrigger({ sourceType, sourceId }) {
  return workflowEvaluateTriggersQueue.add(
    "evaluate",
    { source_type: sourceType, source_id: String(sourceId) }
  );
}

module.exports = {
  QUEUE_NAMES,
  workflowAdvanceQueue,
  workflowBulkEnrollQueue,
  workflowEvaluateTriggersQueue,
  enqueueAdvance,
  enqueueBulkEnroll,
  enqueueEvaluateTrigger,
  ADVANCE_JOB_DEFAULTS,
  BULK_ENROLL_JOB_DEFAULTS,
  EVALUATE_TRIGGER_JOB_DEFAULTS,
};
