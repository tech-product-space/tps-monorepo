/**
 * End-to-end pipeline test for the Phase 2 workflow engine.
 *
 * Drives the full HTTP flow against a live API + worker:
 *   1. Inserts a test PlatformLead so static_list has something to enroll
 *   2. POST  /api/v1/workflows                  → create draft
 *   3. PUT   /api/v1/workflows/:id              → trigger_config + draft_definition
 *   4. POST  /api/v1/workflows/:id/validate
 *   5. POST  /api/v1/workflows/:id/publish      → snapshot version 1
 *   6. POST  /api/v1/workflows/:id/run          → bulk enroll
 *   7. Polls /api/v1/enrollments until completed (or timeout)
 *   8. GETs  /api/v1/enrollments/:id/logs       → prints node_runs timeline
 *   9. Archives the workflow + deletes the test lead
 *
 * The test workflow uses only [delay 3s] → [goal], so NO real email is sent.
 *
 * Prerequisites:
 *   - API server running:    node server.js  (or pm2 start ecosystem.config.js)
 *   - Worker running:        node workers/workflowWorker.js
 *   - Postgres + Redis up
 *
 * Usage:
 *   node sandbox/e2e-pipeline-test.js
 *   API_BASE=http://localhost:3000 node sandbox/e2e-pipeline-test.js
 */

require("dotenv").config();
const { PlatformLead } = require("../models");

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;
const TEST_LEAD_TYPE = `WORKFLOW_E2E_${Date.now()}`;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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

function expect(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function log(step, msg, extra) {
  const line = `[${step}] ${msg}`;
  if (extra !== undefined) {
    console.log(line, typeof extra === "string" ? extra : JSON.stringify(extra));
  } else {
    console.log(line);
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Test body
// ---------------------------------------------------------------------------

async function run() {
  let workflowId = null;
  let testLead = null;

  try {
    // ----- Setup: insert a test lead --------------------------------------
    const testEmail = `e2e-${Date.now()}@example.invalid`;
    testLead = await PlatformLead.create({
      name: "E2E Test Lead",
      email: testEmail,
      phone: null,
      type: TEST_LEAD_TYPE,
    });
    log("setup", `inserted PlatformLead id=${testLead.id} type=${TEST_LEAD_TYPE}`);

    // ----- 1. Create draft -----------------------------------------------
    let r = await api("POST", "/api/v1/workflows", {
      name: `E2E Test ${new Date().toISOString()}`,
      description: "Automated pipeline test — safe to delete",
    });
    expect(r.status === 201, `create draft: got ${r.status}`);
    workflowId = r.body.workflow.id;
    log("1.create", `workflow id=${workflowId}`);

    // ----- 2. Set trigger + nodes ----------------------------------------
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
          batch_size: 100,
        },
      },
      draft_definition: {
        nodes: [
          {
            id: "n1",
            type: "control.delay",
            config: { duration_value: 3, duration_unit: "seconds" },
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
    expect(r.status === 200, `update draft: got ${r.status} body=${JSON.stringify(r.body)}`);
    log("2.update", "trigger + draft_definition saved");

    // ----- 3. Validate ----------------------------------------------------
    r = await api("POST", `/api/v1/workflows/${workflowId}/validate`);
    expect(r.status === 200, `validate http: got ${r.status}`);
    expect(r.body.valid === true, `validation errors: ${JSON.stringify(r.body.errors)}`);
    log("3.validate", "valid=true");

    // ----- 4. Publish -----------------------------------------------------
    r = await api("POST", `/api/v1/workflows/${workflowId}/publish`);
    expect(r.status === 200, `publish: got ${r.status} body=${JSON.stringify(r.body)}`);
    expect(r.body.version === 1, `expected version 1, got ${r.body.version}`);
    log("4.publish", `version=${r.body.version}`);

    // ----- 5. Run ---------------------------------------------------------
    r = await api("POST", `/api/v1/workflows/${workflowId}/run`);
    expect(r.status === 202, `run: got ${r.status} body=${JSON.stringify(r.body)}`);
    const runId = r.body.run_id;
    log("5.run", `queued run_id=${runId}`);

    // ----- 6. Poll until completed ---------------------------------------
    const t0 = Date.now();
    let enrollment = null;
    while (Date.now() - t0 < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const list = await api(
        "GET",
        `/api/v1/enrollments?workflow_id=${workflowId}`
      );
      if (list.status !== 200) continue;
      const items = list.body.items || [];
      if (items.length === 0) {
        process.stdout.write(".");
        continue;
      }
      enrollment = items[0];
      process.stdout.write(`(${enrollment.status})`);
      if (
        enrollment.status === "completed" ||
        enrollment.status === "failed" ||
        enrollment.status === "cancelled"
      ) {
        process.stdout.write("\n");
        break;
      }
    }
    expect(enrollment, "no enrollment was created within timeout");
    expect(
      enrollment.status === "completed",
      `enrollment ended in status=${enrollment.status} reason=${enrollment.error_reason}`
    );
    log("6.complete", `enrollment id=${enrollment.id} status=${enrollment.status}`);

    // ----- 7. Inspect logs ------------------------------------------------
    r = await api("GET", `/api/v1/enrollments/${enrollment.id}/logs`);
    expect(r.status === 200, `logs: got ${r.status}`);
    const runs = r.body.node_runs || [];
    expect(runs.length === 2, `expected 2 node_runs, got ${runs.length}`);
    expect(runs[0].node_id === "n1", `expected first run node_id=n1`);
    expect(runs[0].status === "completed", "delay node should be completed");
    expect(runs[1].node_id === "n2", "expected second run node_id=n2");
    expect(runs[1].status === "completed", "goal node should be completed");
    log("7.logs", "node_runs timeline:");
    for (const nr of runs) {
      console.log(
        `       ${nr.node_id} ${nr.status} ${nr.started_at} → ${nr.finished_at}`
      );
    }

    console.log("\n✅ E2E pipeline test PASSED");
  } catch (err) {
    console.error("\n❌ E2E pipeline test FAILED");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    // Cleanup ------------------------------------------------------------
    try {
      if (workflowId) {
        await api("DELETE", `/api/v1/workflows/${workflowId}`);
        log("cleanup", `archived workflow ${workflowId}`);
      }
      if (testLead) {
        await PlatformLead.destroy({ where: { id: testLead.id } });
        log("cleanup", `deleted PlatformLead ${testLead.id}`);
      }
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(process.exitCode || 0);
  }
}

run();
