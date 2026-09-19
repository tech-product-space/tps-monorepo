const psEnv = require("@ps/env/tps");
/**
 * E2E pause/resume test for the Phase 2 workflow engine.
 *
 * Scenario:
 *   1. Build [delay 8s] → [goal] workflow with a test lead.
 *   2. Publish + run. Enrollment is now sleeping in delay.
 *   3. Pause the workflow before delay expires.
 *   4. Sleep through where the delay would have ended.
 *      The advance handler should throw 'workflow_paused' on its first
 *      try; BullMQ retries with backoff. After backoff exhaustion the
 *      enrollment stays active (the worker's failed listener ignores
 *      'workflow_paused').
 *   5. Resume the workflow.
 *   6. The reconcile cron (runs every 5 min) will re-enqueue.
 *      To make the test fast, we call /api/v1/enrollments/:id (which doesn't
 *      auto-resume) AND directly invoke reconcile via a small helper.
 *   7. Wait for the enrollment to reach 'completed'.
 *
 * Honest disclosure: this test is the slowest because BullMQ's exponential
 * backoff (1m, 5m, 30m) means we either wait for natural retry or trigger
 * reconcile manually. We trigger reconcile manually to keep the test under
 * a minute.
 *
 * Usage:
 *   node sandbox/e2e-pause-resume-test.js
 */

require("dotenv").config();
const { PlatformLead } = require("../models");
const {
  reconcileOnce,
} = require("../service/workflow/reconcile/reconcileEnrollments");

const API_BASE = psEnv.API_BASE || "http://localhost:3000";
const TEST_LEAD_TYPE = `WORKFLOW_PAUSE_${Date.now()}`;

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

async function run() {
  let workflowId = null;
  let testLead = null;

  try {
    testLead = await PlatformLead.create({
      name: "PauseResume Test",
      email: `pause-${Date.now()}@example.invalid`,
      type: TEST_LEAD_TYPE,
    });
    log("setup", `lead id=${testLead.id}`);

    let r = await api("POST", "/api/v1/workflows", {
      name: `PauseResume ${new Date().toISOString()}`,
    });
    expect(r.status === 201, `create: ${r.status}`);
    workflowId = r.body.workflow.id;

    r = await api("PUT", `/api/v1/workflows/${workflowId}`, {
      trigger_config: {
        type: "trigger.static_list",
        config: {
          recipient_filter: {
            sources: [
              {
                type: "platform_leads",
                filters: { programs: [{ types: [TEST_LEAD_TYPE] }] },
              },
            ],
          },
        },
      },
      draft_definition: {
        nodes: [
          {
            id: "n1",
            type: "control.delay",
            config: { duration_value: 8, duration_unit: "seconds" },
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
    expect(r.status === 200, `update: ${r.status}`);

    r = await api("POST", `/api/v1/workflows/${workflowId}/publish`);
    expect(r.status === 200, `publish: ${r.status} ${JSON.stringify(r.body)}`);

    r = await api("POST", `/api/v1/workflows/${workflowId}/run`);
    expect(r.status === 202, `run: ${r.status}`);

    // Wait for enrollment to appear
    let enrollment = null;
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      const list = await api(
        "GET",
        `/api/v1/enrollments?workflow_id=${workflowId}`
      );
      if (list.body.items?.length) {
        enrollment = list.body.items[0];
        if (enrollment.status === "active") break;
      }
    }
    expect(enrollment && enrollment.status === "active", "enrollment not active");
    log("active", `enr=${enrollment.id} sleeping in n1`);

    // PAUSE before the delay expires
    r = await api("POST", `/api/v1/workflows/${workflowId}/pause`);
    expect(r.status === 200, `pause: ${r.status} ${JSON.stringify(r.body)}`);
    log("pause", "workflow paused");

    // Sleep past the original delay window. The advance job fires, sees
    // status=paused, throws retryable. BullMQ retries, all fail with the
    // same. After exhaustion, the failed listener ignores 'workflow_paused'
    // so the enrollment stays active with no scheduled work — reconcile
    // will rescue it on resume.
    log("wait", "sleeping 10s past the delay window...");
    await sleep(10_000);

    r = await api("GET", `/api/v1/enrollments/${enrollment.id}`);
    expect(
      r.body.enrollment.status === "active",
      `enrollment should still be active during pause, got ${r.body.enrollment.status}`
    );
    log("still-active", "enrollment held by paused workflow");

    // RESUME
    r = await api("POST", `/api/v1/workflows/${workflowId}/resume`);
    expect(r.status === 200, `resume: ${r.status}`);
    log("resume", "workflow resumed");

    // Trigger reconcile manually so we don't wait 5 min for the cron tick.
    // thresholdMs=0 forces the sweep to include enrollments that just became
    // overdue — production uses 2 min to avoid racing BullMQ's own retries.
    const recon = await reconcileOnce({ thresholdMs: 0 });
    log("reconcile", `requeued=${recon.requeued} skipped=${recon.skipped}`);

    // Now the enrollment should advance to goal within a few seconds
    let done = false;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      r = await api("GET", `/api/v1/enrollments/${enrollment.id}`);
      if (r.body.enrollment.status === "completed") {
        done = true;
        break;
      }
      process.stdout.write(".");
    }
    process.stdout.write("\n");
    expect(done, `enrollment did not complete after resume; status=${r.body.enrollment.status}`);

    console.log("\n✅ E2E pause/resume test PASSED");
  } catch (err) {
    console.error("\n❌ E2E pause/resume test FAILED");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    try {
      if (workflowId) {
        // workflow may be active or paused at this point
        const wf = await api("GET", `/api/v1/workflows/${workflowId}`);
        if (wf.body?.workflow?.status === "paused") {
          await api("POST", `/api/v1/workflows/${workflowId}/resume`);
        }
        await api("DELETE", `/api/v1/workflows/${workflowId}`);
      }
      if (testLead) await PlatformLead.destroy({ where: { id: testLead.id } });
      log("cleanup", "done");
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(process.exitCode || 0);
  }
}

run();
