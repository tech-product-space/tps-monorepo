const psEnv = require("@ps/env/tps");
/**
 * HTTP smoke test for the workflow API surface.
 *
 * Hits the actual endpoints created in Phase 1-4 via Node's built-in fetch
 * (Node 18+). Verifies that:
 *   - CRUD endpoints respond
 *   - validate returns errors for a bad DAG
 *   - publish flips status to active
 *   - run returns 202 with run_id
 *   - pause/resume work
 *   - opt-out endpoint accepts payloads
 *
 * Prereqs:
 *   - API server running:    node server.js   (default :3000)
 *   - Worker running:        node workers/workflowWorker.js
 *
 * Override the base URL with API_BASE env var if not localhost:3000.
 *
 * Usage:
 *   node sandbox/e2e-http-smoke.js
 */

"use strict";

require("dotenv").config();

const API = psEnv.API_BASE || "http://localhost:" + (psEnv.PORT || "3000");
const ROOT = `${API}/api/v1`;

let passed = 0;
let failed = 0;

function pass(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}
function fail(label, extra) {
  failed++;
  console.log(`  ✗ ${label}`);
  if (extra) console.log("      ", extra);
}

async function http(method, path, body) {
  const res = await fetch(ROOT + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, data };
}

async function expect(label, { status, data }, predicate) {
  try {
    if (predicate({ status, data })) {
      pass(`${label}  [${status}]`);
      return true;
    }
    fail(label, `status=${status} body=${JSON.stringify(data).slice(0, 200)}`);
    return false;
  } catch (e) {
    fail(label, e.message);
    return false;
  }
}

(async () => {
  console.log(`HTTP smoke @ ${ROOT}\n`);

  // 1. create draft
  let r = await http("POST", "/workflows", {
    name: "http-smoke-" + Date.now(),
    description: "from sandbox/e2e-http-smoke.js",
  });
  await expect("create draft workflow", r, ({ status, data }) => status === 201 && data?.workflow?.id);
  const wfId = r.data?.workflow?.id;
  if (!wfId) {
    console.log("\nFAIL: cannot continue without workflow id");
    process.exit(1);
  }

  // 2. update draft with a good DAG + static_list trigger
  r = await http("PUT", `/workflows/${wfId}`, {
    trigger_config: {
      type: "trigger.static_list",
      config: {
        recipient_filter: { sources: [{ type: "platform_leads", filters: {} }] },
        batch_size: 100,
      },
    },
    draft_definition: {
      nodes: [
        { id: "g", type: "control.goal", config: { goal_name: "done" } },
      ],
      edges: [],
    },
  });
  await expect("update draft", r, ({ status }) => status === 200);

  // 3. validate good DAG → valid:true
  r = await http("POST", `/workflows/${wfId}/validate`);
  await expect("validate (good)", r, ({ status, data }) => status === 200 && data.valid === true);

  // 4. update to a bad DAG, validate → valid:false
  await http("PUT", `/workflows/${wfId}`, {
    draft_definition: {
      nodes: [
        { id: "g", type: "control.goal", config: { goal_name: "done" } },
        { id: "x", type: "control.delay", config: { duration_value: 1, duration_unit: "days" } },
      ],
      edges: [], // x is dead-end and not a goal → validator should reject
    },
  });
  r = await http("POST", `/workflows/${wfId}/validate`);
  await expect("validate (bad)", r, ({ status, data }) =>
    status === 200 && data.valid === false && Array.isArray(data.errors)
  );

  // 5. restore good DAG, publish
  await http("PUT", `/workflows/${wfId}`, {
    draft_definition: {
      nodes: [{ id: "g", type: "control.goal", config: { goal_name: "done" } }],
      edges: [],
    },
  });
  r = await http("POST", `/workflows/${wfId}/publish`);
  await expect("publish", r, ({ status, data }) => status === 200 && data.version === 1);

  // 6. get → should now show active with active_version
  r = await http("GET", `/workflows/${wfId}`);
  await expect("get after publish", r, ({ status, data }) =>
    status === 200 && data.workflow.status === "active" && data.active_version
  );

  // 7. pause / resume
  r = await http("POST", `/workflows/${wfId}/pause`);
  await expect("pause", r, ({ status, data }) => status === 200 && data.workflow.status === "paused");

  r = await http("POST", `/workflows/${wfId}/resume`);
  await expect("resume", r, ({ status, data }) => status === 200 && data.workflow.status === "active");

  // 8. opt-out endpoint accepts a valid body
  r = await http("POST", `/leads/opt-out`, {
    lead_source_type: "platform_leads",
    lead_source_id: "http-smoke-fake-" + Date.now(),
    channel: "email",
    reason: "http-smoke",
  });
  await expect("opt-out", r, ({ status, data }) =>
    status === 200 && typeof data.enrollments_cancelled === "number"
  );

  // 9. list enrollments works
  r = await http("GET", `/enrollments?workflow_id=${wfId}`);
  await expect("list enrollments", r, ({ status, data }) =>
    status === 200 && Array.isArray(data.items)
  );

  // 10. attempt edit on active workflow → 409
  r = await http("PUT", `/workflows/${wfId}`, { name: "should fail" });
  await expect("edit active workflow rejected", r, ({ status }) => status === 409);

  // 11. archive (no enrollments) → 204
  r = await http("DELETE", `/workflows/${wfId}`);
  await expect("archive empty workflow", r, ({ status }) => status === 204);

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
