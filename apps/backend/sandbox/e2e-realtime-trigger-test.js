/**
 * E2E realtime trigger test for Phase 3.
 *
 * Scenarios verified:
 *   1. HAPPY PATH — admin creates a workflow with trigger.new_lead matching
 *      platform_leads/type=X. Then a new PlatformLead with type=X is inserted.
 *      Within seconds, an enrollment is auto-created and progresses.
 *   2. FILTER MISS — inserting a PlatformLead with type=Y (not matching the
 *      trigger's filter) creates no enrollment.
 *   3. DEDUP — re-inserting (effectively) the same lead within the dedup
 *      window does NOT create a duplicate enrollment.
 *
 * Prerequisites:
 *   - API server running (server.js)
 *   - Worker running (workers/workflowWorker.js)
 *   - Postgres + Redis up
 *
 * Usage: node sandbox/e2e-realtime-trigger-test.js
 */

require("dotenv").config();
const { PlatformLead, WorkflowEnrollment } = require("../models");

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const TYPE_MATCH = `WF_TRIG_MATCH_${Date.now()}`;
const TYPE_NONMATCH = `WF_TRIG_NONMATCH_${Date.now()}`;

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

function expect(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function log(step, msg, extra) {
  const line = `[${step}] ${msg}`;
  if (extra !== undefined)
    console.log(line, typeof extra === "string" ? extra : JSON.stringify(extra));
  else console.log(line);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollForEnrollment(workflowId, expectedCount, timeoutMs) {
  const t0 = Date.now();
  let rows = [];
  while (Date.now() - t0 < timeoutMs) {
    rows = await WorkflowEnrollment.findAll({
      where: { workflow_id: workflowId },
      order: [["createdAt", "ASC"]],
    });
    if (rows.length >= expectedCount) return rows;
    await sleep(500);
  }
  return rows;
}

async function run() {
  let workflowId = null;
  const insertedLeadIds = [];

  try {
    // ---- Build workflow with new_lead trigger -------------------------
    let r = await api("POST", "/api/v1/workflows", {
      name: `Realtime Trigger Test ${new Date().toISOString()}`,
    });
    expect(r.status === 201, `create: ${r.status}`);
    workflowId = r.body.workflow.id;
    log("setup", `workflow ${workflowId}`);

    r = await api("PUT", `/api/v1/workflows/${workflowId}`, {
      trigger_config: {
        type: "trigger.new_lead",
        config: {
          recipient_filter: {
            sources: [
              {
                type: "platform_leads",
                filters: { programs: [{ types: [TYPE_MATCH] }] },
              },
            ],
          },
          dedup_window_hours: 24,
          allow_re_enrollment: false,
        },
      },
      draft_definition: {
        nodes: [
          {
            id: "n1",
            type: "control.delay",
            config: { duration_value: 2, duration_unit: "seconds" },
          },
          {
            id: "n2",
            type: "control.goal",
            config: { goal_name: "completed" },
          },
        ],
        edges: [{ from: "n1", to: "n2" }],
      },
    });
    expect(r.status === 200, `update: ${r.status} ${JSON.stringify(r.body)}`);

    r = await api("POST", `/api/v1/workflows/${workflowId}/publish`);
    expect(r.status === 200, `publish: ${r.status} ${JSON.stringify(r.body)}`);
    log("publish", `v${r.body.version} active`);

    // ---- Scenario 1: HAPPY PATH ---------------------------------------
    const lead1 = await PlatformLead.create({
      name: "Trigger Match Lead",
      email: `match-${Date.now()}@example.invalid`,
      type: TYPE_MATCH,
    });
    insertedLeadIds.push(lead1.id);
    log("happy", `inserted lead id=${lead1.id} type=${TYPE_MATCH}`);

    let enrollments = await pollForEnrollment(workflowId, 1, 8000);
    expect(
      enrollments.length === 1,
      `expected 1 enrollment after match, got ${enrollments.length}`
    );
    expect(
      String(enrollments[0].lead_source_id) === String(lead1.id),
      `enrollment lead_source_id mismatch`
    );
    log("happy", `enrollment ${enrollments[0].id} created via afterCreate hook`);

    // ---- Scenario 2: FILTER MISS --------------------------------------
    const lead2 = await PlatformLead.create({
      name: "Trigger NonMatch Lead",
      email: `nonmatch-${Date.now()}@example.invalid`,
      type: TYPE_NONMATCH,
    });
    insertedLeadIds.push(lead2.id);
    log("miss", `inserted lead id=${lead2.id} type=${TYPE_NONMATCH}`);

    // Wait briefly for any (incorrect) enrollment to appear, then assert no new ones
    await sleep(3000);
    enrollments = await WorkflowEnrollment.findAll({
      where: { workflow_id: workflowId },
    });
    expect(
      enrollments.length === 1,
      `non-matching lead should not enroll; got ${enrollments.length} total enrollments`
    );
    log("miss", `confirmed no enrollment for non-matching type`);

    // ---- Scenario 3: DEDUP ---------------------------------------------
    // Insert another matching lead with a NEW email but same type — that's
    // a different lead and SHOULD enroll. To test actual dedup we'd need
    // the same source_id, but PlatformLeads PK is auto-incremented; inserting
    // again is technically a new row. Instead, simulate dedup by directly
    // enqueuing the trigger evaluation again for the same lead id.
    const {
      enqueueEvaluateTrigger,
    } = require("../queues/workflowQueues");
    await enqueueEvaluateTrigger({
      sourceType: "platform_leads",
      sourceId: lead1.id,
    });
    log("dedup", `re-enqueued trigger for lead id=${lead1.id}`);

    await sleep(2500);
    enrollments = await WorkflowEnrollment.findAll({
      where: { workflow_id: workflowId },
    });
    expect(
      enrollments.length === 1,
      `dedup should prevent second enrollment; got ${enrollments.length}`
    );
    log("dedup", `confirmed dedup blocked duplicate enrollment`);

    // ---- Wait for flow to finish (n1 delay = 2s, then n2 goal) ---------
    log("wait", "waiting for the matched enrollment to complete...");
    const completedEnrollments = await waitForCompletion(workflowId, 1, 10000);
    expect(
      completedEnrollments[0].status === "completed",
      `enrollment should reach completed, got ${completedEnrollments[0].status}`
    );
    log("complete", `enrollment status=completed via realtime trigger path`);

    console.log("\n✅ E2E realtime trigger test PASSED");
  } catch (err) {
    console.error("\n❌ E2E realtime trigger test FAILED");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    // ---- Cleanup -------------------------------------------------------
    try {
      if (workflowId) {
        await api("DELETE", `/api/v1/workflows/${workflowId}`);
      }
      for (const id of insertedLeadIds) {
        await PlatformLead.destroy({ where: { id } });
      }
      log("cleanup", "done");
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(process.exitCode || 0);
  }
}

async function waitForCompletion(workflowId, expected, timeoutMs) {
  const t0 = Date.now();
  let rows = [];
  while (Date.now() - t0 < timeoutMs) {
    rows = await WorkflowEnrollment.findAll({
      where: { workflow_id: workflowId },
    });
    const completed = rows.filter(
      (r) => r.status === "completed" || r.status === "failed" || r.status === "cancelled"
    );
    if (completed.length >= expected) return completed;
    await sleep(500);
  }
  return rows;
}

run();
