/**
 * E2E opt-out test for the Phase 2 workflow engine.
 *
 * Scenario:
 *   1. Create a test lead.
 *   2. Build a workflow [delay 10s] → [goal] using static_list trigger.
 *   3. Publish + run → enrollment created, sleeping in delay.
 *   4. While the enrollment is in flight, POST /api/v1/leads/opt-out.
 *   5. Verify the enrollment moved to status='cancelled' with reason
 *      'opted_out_email' (PRD §13.1).
 *
 * This validates that opt-out cancels in-flight enrollments without waiting
 * for the next handler to fire.
 *
 * Usage:
 *   node sandbox/e2e-opt-out-test.js
 */

require("dotenv").config();
const { PlatformLead, LeadConsent } = require("../models");

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const TEST_LEAD_TYPE = `WORKFLOW_OPTOUT_${Date.now()}`;

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
    // Setup test lead
    testLead = await PlatformLead.create({
      name: "OptOut Test",
      email: `optout-${Date.now()}@example.invalid`,
      phone: null,
      type: TEST_LEAD_TYPE,
    });
    log("setup", `lead id=${testLead.id}`);

    // Clean up any stale consent row (in case test ran before)
    await LeadConsent.destroy({
      where: {
        lead_source_type: "platform_leads",
        lead_source_id: String(testLead.id),
      },
    });

    // Create + configure workflow with a longer delay so we can opt out mid-flight
    let r = await api("POST", "/api/v1/workflows", {
      name: `OptOut Test ${new Date().toISOString()}`,
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
            config: { duration_value: 10, duration_unit: "seconds" },
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

    r = await api("POST", `/api/v1/workflows/${workflowId}/run`);
    expect(r.status === 202, `run: ${r.status}`);
    log("run", "queued");

    // Wait for enrollment to appear and be in active status (sleeping in delay)
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
    expect(enrollment, "enrollment never appeared");
    expect(
      enrollment.status === "active",
      `enrollment status should be active during delay, got ${enrollment.status}`
    );
    log("active", `enrollment ${enrollment.id} sleeping in n1`);

    // Now opt the lead out
    r = await api("POST", "/api/v1/leads/opt-out", {
      lead_source_type: "platform_leads",
      lead_source_id: String(testLead.id),
      channel: "email",
      reason: "e2e_test",
    });
    expect(r.status === 200, `opt-out: ${r.status} ${JSON.stringify(r.body)}`);
    expect(
      r.body.enrollments_cancelled >= 1,
      `expected at least 1 enrollment cancelled, got ${r.body.enrollments_cancelled}`
    );
    log("optout", `recorded; cancelled=${r.body.enrollments_cancelled}`);

    // Verify the enrollment is now cancelled
    r = await api("GET", `/api/v1/enrollments/${enrollment.id}`);
    expect(r.status === 200, `get: ${r.status}`);
    expect(
      r.body.enrollment.status === "cancelled",
      `enrollment should be cancelled, got ${r.body.enrollment.status}`
    );
    expect(
      r.body.enrollment.error_reason === "opted_out_email",
      `expected reason 'opted_out_email', got '${r.body.enrollment.error_reason}'`
    );
    log("verified", `enrollment status=cancelled reason=${r.body.enrollment.error_reason}`);

    // Wait past the delay window to confirm no goal node fires
    log("wait", "sleeping 12s to ensure delay window passes...");
    await sleep(12_000);
    r = await api("GET", `/api/v1/enrollments/${enrollment.id}`);
    expect(
      r.body.enrollment.status === "cancelled",
      "enrollment should still be cancelled after delay window"
    );

    console.log("\n✅ E2E opt-out test PASSED");
  } catch (err) {
    console.error("\n❌ E2E opt-out test FAILED");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    try {
      if (workflowId) await api("DELETE", `/api/v1/workflows/${workflowId}`);
      if (testLead) {
        await LeadConsent.destroy({
          where: {
            lead_source_type: "platform_leads",
            lead_source_id: String(testLead.id),
          },
        });
        await PlatformLead.destroy({ where: { id: testLead.id } });
      }
      log("cleanup", "done");
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(process.exitCode || 0);
  }
}

run();
