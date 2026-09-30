/**
 * One-off smoke test for the workflow worker pipeline:
 *   1. Enqueues a dummy advance job
 *   2. Enqueues a dummy bulk-enroll job
 *   3. Exits
 *
 * Run this in one terminal while `node workers/workflowWorker.js` runs in another.
 * You should see the worker log both job receipts.
 *
 * Usage:  node sandbox/smoke-test-worker.js
 */

require("dotenv").config();
const {
  enqueueAdvance,
  enqueueBulkEnroll,
  workflowAdvanceQueue,
  workflowBulkEnrollQueue,
} = require("../queues/workflowQueues");

(async () => {
  try {
    await enqueueAdvance({
      enrollmentId: "smoke-test-nonexistent-enr",
      nodeId: "node-1",
      attempt: 1,
      delayMs: 0,
    });
    console.log("enqueued advance job (with bad enrollment id; expects 'enrollment_not_found' in worker log)");

    await enqueueBulkEnroll({
      workflowId: "smoke-test-wf-1",
      runId: "smoke-run-1",
    });
    console.log("enqueued bulk-enroll job");

    // Close queue connections so the script exits
    await workflowAdvanceQueue.close();
    await workflowBulkEnrollQueue.close();
    process.exit(0);
  } catch (err) {
    console.error("smoke test failed:", err);
    process.exit(1);
  }
})();
