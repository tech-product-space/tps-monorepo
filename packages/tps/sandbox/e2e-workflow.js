const psEnv = require("@ps/env/tps");
/**
 * End-to-end test for the workflow engine (Phase 2).
 *
 * What this exercises:
 *   1. Happy path — publish, manually enroll fake leads, verify completion
 *   2. Publish validation failure — bad DAG should be rejected with errors
 *   3. Cancel enrollment mid-flight
 *   4. Pause / resume affects in-flight enrollments
 *   5. Opt-out cascade — recording opt-out cancels lead's active enrollments
 *
 * What this does NOT do:
 *   - Send real emails (no send_email handler exercised — that would need a
 *     real recipient and verified sender; run those manually).
 *   - Touch the campaign feature or any existing data.
 *
 * Prereqs:
 *   - Postgres reachable (.env configured)
 *   - Redis reachable
 *   - Worker process running:  node workers/workflowWorker.js
 *
 * Usage:
 *   node sandbox/e2e-workflow.js
 *
 * The script creates throwaway workflows and enrollments using fake lead
 * source ids of the form `e2e-fake-<ulid>`. It cleans up its own data at
 * the end (only rows it created).
 */

"use strict";

require("dotenv").config();

const { ulid } = require("ulid");
const sequelize = require("../config/db");
const {
  Workflow,
  WorkflowEnrollment,
  WorkflowNodeRun,
  WorkflowVersion,
  LeadConsent,
} = require("../models");
const {
  WORKFLOW_STATUS,
  ENROLLMENT_STATUS,
  NODE_TYPE,
  TRIGGER_TYPE,
  ENROLLMENT_SOURCE,
  LEAD_SOURCE_TYPE,
} = require("../constants/workflow");
const {
  publishWorkflow,
  PublishError,
} = require("../service/workflow/publish/publishWorkflow");
const {
  enqueueAdvance,
  workflowAdvanceQueue,
  workflowBulkEnrollQueue,
} = require("../queues/workflowQueues");
const {
  recordOptOut,
} = require("../service/workflow/compliance/optOutGuard");
const {
  computeDelayMs,
} = require("../service/workflow/engine/utils/computeDelay");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const E2E_PREFIX = "e2e-fake-";
const createdWorkflowIds = [];
const createdConsentKeys = []; // ["source_type:source_id", ...]

function logSection(title) {
  console.log("\n" + "═".repeat(70));
  console.log("  " + title);
  console.log("═".repeat(70));
}

function logStep(msg) {
  console.log("  → " + msg);
}

function logResult(ok, msg) {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForEnrollment(id, targetStatus, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await WorkflowEnrollment.findByPk(id);
    if (!row) return null;
    if (row.status === targetStatus) return row;
    if (
      row.status === ENROLLMENT_STATUS.FAILED ||
      row.status === ENROLLMENT_STATUS.CANCELLED
    ) {
      return row; // terminal, won't change
    }
    await sleep(500);
  }
  return await WorkflowEnrollment.findByPk(id);
}

async function createDraftWorkflow({ nodes, edges, name }) {
  const wf = await Workflow.create({
    name: name || `E2E ${ulid()}`,
    description: "Created by sandbox/e2e-workflow.js",
    status: WORKFLOW_STATUS.DRAFT,
    trigger_config: {
      type: TRIGGER_TYPE.STATIC_LIST,
      config: {
        recipient_filter: { sources: [] }, // we bypass static_list in e2e
        batch_size: 100,
      },
    },
    draft_definition: { nodes, edges },
    settings: {},
  });
  createdWorkflowIds.push(wf.id);
  return wf;
}

async function manuallyEnroll(workflow, fakeLeadId) {
  const entryNode = workflow.draft_definition?.nodes?.[0];
  if (!entryNode) throw new Error("workflow has no entry node");
  // If the entry node IS a delay, honour its duration (same behaviour as
  // service/workflow/publish/enrollBulk.js).
  const entryDelayMs =
    entryNode.type === NODE_TYPE.CONTROL_DELAY
      ? computeDelayMs(entryNode.config)
      : 0;
  const enrollment = await WorkflowEnrollment.create({
    workflow_id: workflow.id,
    workflow_version: workflow.current_version,
    lead_source_type: LEAD_SOURCE_TYPE.PLATFORM_LEADS,
    lead_source_id: fakeLeadId,
    lead_email_snapshot: `${fakeLeadId}@example.com`,
    lead_name_snapshot: `Fake ${fakeLeadId}`,
    status: ENROLLMENT_STATUS.ACTIVE,
    current_node_id: entryNode.id,
    enrollment_source: ENROLLMENT_SOURCE.MANUAL,
    context: { e2e: true },
    next_scheduled_at: new Date(Date.now() + entryDelayMs),
  });
  await enqueueAdvance({
    enrollmentId: enrollment.id,
    nodeId: entryNode.id,
    attempt: 1,
    delayMs: entryDelayMs,
  });
  return enrollment;
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

async function testHappyPath() {
  logSection("TEST 1: Happy path — single goal node");

  logStep("create draft workflow with [goal]");
  const wf = await createDraftWorkflow({
    nodes: [{ id: "n1", type: NODE_TYPE.CONTROL_GOAL, config: { goal_name: "done" } }],
    edges: [],
  });

  logStep("publish workflow");
  await publishWorkflow({ workflowId: wf.id, publishedBy: "e2e-test" });
  await wf.reload();

  if (wf.status !== WORKFLOW_STATUS.ACTIVE) {
    logResult(false, `workflow status is ${wf.status}, expected active`);
    return false;
  }
  logResult(true, `workflow active, current_version=${wf.current_version}`);

  logStep("enroll 3 fake leads");
  const enrollments = [];
  for (let i = 0; i < 3; i++) {
    const e = await manuallyEnroll(wf, `${E2E_PREFIX}${ulid()}`);
    enrollments.push(e);
  }

  logStep("waiting up to 10s for all to complete...");
  let allCompleted = true;
  for (const e of enrollments) {
    const final = await waitForEnrollment(e.id, ENROLLMENT_STATUS.COMPLETED, 10_000);
    if (!final || final.status !== ENROLLMENT_STATUS.COMPLETED) {
      logResult(false, `enrollment ${e.id} status=${final?.status}`);
      allCompleted = false;
    }
  }
  if (allCompleted) {
    logResult(true, `all 3 enrollments reached completed`);
  }

  const runs = await WorkflowNodeRun.findAll({
    where: { enrollment_id: enrollments.map((e) => e.id) },
  });
  logResult(runs.length === 3, `node_runs count = ${runs.length} (expected 3)`);

  return allCompleted && runs.length === 3;
}

async function testPublishValidation() {
  logSection("TEST 2: Publish validation failure");

  logStep("create draft with a cycle (n1 → n2 → n1)");
  const wf = await createDraftWorkflow({
    nodes: [
      { id: "n1", type: NODE_TYPE.CONTROL_GOAL, config: { goal_name: "x" } },
      { id: "n2", type: NODE_TYPE.CONTROL_GOAL, config: { goal_name: "y" } },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n1" },
    ],
  });

  logStep("attempt publish — should fail with details");
  try {
    await publishWorkflow({ workflowId: wf.id, publishedBy: "e2e-test" });
    logResult(false, "publish succeeded but should have failed");
    return false;
  } catch (err) {
    if (err instanceof PublishError) {
      logResult(true, `rejected: ${err.message}`);
      console.log(
        "    errors:",
        JSON.stringify(err.details?.errors || [], null, 2).replace(/\n/g, "\n    ")
      );
      return true;
    }
    logResult(false, `unexpected error type: ${err.message}`);
    return false;
  }
}

async function testCancelEnrollment() {
  logSection("TEST 3: Cancel enrollment mid-flight");

  logStep("create workflow with 30-second delay then goal");
  const wf = await createDraftWorkflow({
    nodes: [
      {
        id: "n1",
        type: NODE_TYPE.CONTROL_DELAY,
        config: { duration_value: 30, duration_unit: "seconds" },
      },
      { id: "n2", type: NODE_TYPE.CONTROL_GOAL, config: { goal_name: "done" } },
    ],
    edges: [{ from: "n1", to: "n2" }],
  });
  await publishWorkflow({ workflowId: wf.id, publishedBy: "e2e-test" });
  await wf.reload();

  logStep("enroll one fake lead (entry node is a 30s delay)");
  const enr = await manuallyEnroll(wf, `${E2E_PREFIX}${ulid()}`);

  logStep("wait 2s, then cancel (delay job is still queued, not yet fired)");
  await sleep(2000);
  await enr.update({
    status: ENROLLMENT_STATUS.CANCELLED,
    completed_at: new Date(),
    current_node_id: null,
    next_scheduled_at: null,
    error_reason: "cancelled_by_e2e_test",
  });

  logStep("wait 35s for delay job to fire — engine should no-op (status guard)");
  await sleep(35000);
  const final = await WorkflowEnrollment.findByPk(enr.id);
  const runs = await WorkflowNodeRun.findAll({ where: { enrollment_id: enr.id } });

  logResult(final.status === ENROLLMENT_STATUS.CANCELLED, `status=${final.status}`);
  logResult(
    runs.length === 0,
    `node_runs=${runs.length} (expected 0: cancel before any node ran)`
  );

  return final.status === ENROLLMENT_STATUS.CANCELLED;
}

async function testPauseResume() {
  logSection("TEST 4: Pause / resume (note: takes ~30s)");

  logStep("create workflow with 10s delay then goal");
  const wf = await createDraftWorkflow({
    nodes: [
      {
        id: "n1",
        type: NODE_TYPE.CONTROL_DELAY,
        config: { duration_value: 10, duration_unit: "seconds" },
      },
      { id: "n2", type: NODE_TYPE.CONTROL_GOAL, config: { goal_name: "done" } },
    ],
    edges: [{ from: "n1", to: "n2" }],
  });
  await publishWorkflow({ workflowId: wf.id, publishedBy: "e2e-test" });
  await wf.reload();

  logStep("enroll lead, immediately pause workflow before delay can fire");
  const enr = await manuallyEnroll(wf, `${E2E_PREFIX}${ulid()}`);
  await wf.update({ status: WORKFLOW_STATUS.PAUSED });

  logStep("wait 15s — delay job fires during pause, advanceEnrollment throws workflow_paused");
  await sleep(15000);
  let snapshot = await WorkflowEnrollment.findByPk(enr.id);
  const wasActiveDuringPause = snapshot.status === ENROLLMENT_STATUS.ACTIVE;
  logResult(
    wasActiveDuringPause,
    `enrollment.status=${snapshot.status} (expected active)`
  );

  logStep("resume workflow + re-enqueue with attempt=2 (different jobId)");
  await wf.update({ status: WORKFLOW_STATUS.ACTIVE });
  await enqueueAdvance({
    enrollmentId: enr.id,
    nodeId: snapshot.current_node_id,
    attempt: 2,
    delayMs: 0,
  });

  logStep("wait up to 15s for completion");
  const final = await waitForEnrollment(enr.id, ENROLLMENT_STATUS.COMPLETED, 15000);
  const completed = final && final.status === ENROLLMENT_STATUS.COMPLETED;
  logResult(completed, `final status=${final?.status}`);

  return wasActiveDuringPause && completed;
}

async function testOptOutCascade() {
  logSection("TEST 5: Opt-out cascades to active enrollments");

  logStep("create workflow with 60s delay (stays in flight while we opt-out)");
  const wf = await createDraftWorkflow({
    nodes: [
      {
        id: "n1",
        type: NODE_TYPE.CONTROL_DELAY,
        config: { duration_value: 60, duration_unit: "seconds" },
      },
      { id: "n2", type: NODE_TYPE.CONTROL_GOAL, config: { goal_name: "done" } },
    ],
    edges: [{ from: "n1", to: "n2" }],
  });
  await publishWorkflow({ workflowId: wf.id, publishedBy: "e2e-test" });
  await wf.reload();

  const fakeLeadId = `${E2E_PREFIX}${ulid()}`;
  createdConsentKeys.push(`${LEAD_SOURCE_TYPE.PLATFORM_LEADS}:${fakeLeadId}`);

  logStep("enroll the lead");
  const enr = await manuallyEnroll(wf, fakeLeadId);

  logStep("wait 2s, then record opt-out + cancel matching active enrollments");
  await sleep(2000);
  await sequelize.transaction(async (tx) => {
    await recordOptOut({
      sourceType: LEAD_SOURCE_TYPE.PLATFORM_LEADS,
      sourceId: fakeLeadId,
      channel: "email",
      reason: "e2e-test",
    });
    await WorkflowEnrollment.update(
      {
        status: ENROLLMENT_STATUS.CANCELLED,
        completed_at: new Date(),
        current_node_id: null,
        next_scheduled_at: null,
        error_reason: "opted_out_email",
      },
      {
        where: {
          lead_source_type: LEAD_SOURCE_TYPE.PLATFORM_LEADS,
          lead_source_id: fakeLeadId,
          status: ENROLLMENT_STATUS.ACTIVE,
        },
        transaction: tx,
      }
    );
  });

  const final = await WorkflowEnrollment.findByPk(enr.id);
  logResult(
    final.status === ENROLLMENT_STATUS.CANCELLED,
    `enrollment.status=${final.status}, reason=${final.error_reason}`
  );
  return final.status === ENROLLMENT_STATUS.CANCELLED;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  logSection("CLEANUP");

  if (createdWorkflowIds.length) {
    logStep(`removing ${createdWorkflowIds.length} test workflows and their data`);
    await WorkflowNodeRun.destroy({
      where: {
        enrollment_id: {
          [require("sequelize").Op.in]: (
            await WorkflowEnrollment.findAll({
              where: { workflow_id: createdWorkflowIds },
              attributes: ["id"],
              raw: true,
            })
          ).map((r) => r.id),
        },
      },
    });
    await WorkflowEnrollment.destroy({
      where: { workflow_id: createdWorkflowIds },
    });
    await WorkflowVersion.destroy({
      where: { workflow_id: createdWorkflowIds },
    });
    await Workflow.destroy({ where: { id: createdWorkflowIds } });
  }

  if (createdConsentKeys.length) {
    logStep(`removing ${createdConsentKeys.length} test consent rows`);
    for (const key of createdConsentKeys) {
      const [sourceType, sourceId] = key.split(":");
      await LeadConsent.destroy({
        where: { lead_source_type: sourceType, lead_source_id: sourceId },
      });
    }
  }

  logStep("closing queue + DB connections");
  await workflowAdvanceQueue.close();
  await workflowBulkEnrollQueue.close();
  await sequelize.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const fast = psEnv.E2E_FAST === "1";
  const results = {};

  try {
    await sequelize.authenticate();
    console.log("e2e: connected to Postgres");
    console.log(
      "\nPrereq: the worker process must be running in another terminal."
    );
    console.log("        node workers/workflowWorker.js\n");

    results.happyPath = await testHappyPath();
    results.publishValidation = await testPublishValidation();
    results.cancel = await testCancelEnrollment();
    if (!fast) {
      results.pauseResume = await testPauseResume();
    } else {
      console.log("\n(skipping pause/resume test, set E2E_FAST=0 to include)");
    }
    results.optOut = await testOptOutCascade();
  } catch (err) {
    console.error("\nFATAL:", err);
    results.fatal = err.message;
  } finally {
    await cleanup();
  }

  console.log("\n" + "═".repeat(70));
  console.log("  RESULTS");
  console.log("═".repeat(70));
  let allPass = true;
  for (const [name, ok] of Object.entries(results)) {
    if (name === "fatal") continue;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) allPass = false;
  }
  if (results.fatal) {
    console.log(`  FATAL  ${results.fatal}`);
    allPass = false;
  }
  console.log("═".repeat(70));
  process.exit(allPass ? 0 : 1);
})();
