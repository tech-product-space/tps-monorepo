/**
 * E2E Meta-lead live trigger test.
 *
 * Simulates the Meta cron sync by inserting external_leads rows via the
 * exact same code path (bulkCreate with hooks on) — Facebook is never
 * touched. Verifies the full chain:
 *   insert → afterBulkCreate hook → evaluate-triggers queue → matcher
 *   (form_ids / wildcard) → enrollment → advance.
 *
 * Scenarios (run in phases so the global "max 1 active workflow per lead"
 * cap can't make results order-dependent — only one workflow is live at a
 * time):
 *   1. FORM MATCH — workflow watches form_ids=[F1]; a typeless lead from F1
 *      (unmapped-form case) enrolls.
 *   2. FORM MISS — a lead from a different form does NOT enroll.
 *   3. SIBLING RACE — one Meta lead inserted into TWO lead types in a single
 *      bulkCreate (what the per-type sync does for multi-type forms) fires
 *      two parallel evaluations but must produce exactly ONE enrollment
 *      (identity dedup + advisory lock).
 *   4. WILDCARD — a second workflow watching "any Meta lead" (no form_ids),
 *      created after phase 1 ends, enrolls a lead from any form.
 *
 * Prerequisites:
 *   - API server running (server.js)
 *   - Worker running (npm run worker:dev)
 *   - Postgres + Redis up
 *
 * Usage: node sandbox/e2e-meta-trigger-test.js
 */

require("dotenv").config();
const {
  ExternalLead,
  ExternalLeadType,
  WorkflowEnrollment,
} = require("../models");
const { EXTERNAL_LEAD_SOURCE } = require("../constants/externalLeads");

const API_BASE =
  process.env.API_BASE || `http://localhost:${process.env.PORT || 3000}`;

const RUN = Date.now();
const FORM_MATCH = `TESTFORM_MATCH_${RUN}`;
const FORM_OTHER = `TESTFORM_OTHER_${RUN}`;

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

/** Insert leads exactly like service/meta/metaLeadSync.js does. */
function insertLikeSync(rows) {
  return ExternalLead.bulkCreate(rows, { ignoreDuplicates: true });
}

function metaLeadRow({ externalLeadId, email, formId, typeId = null, name }) {
  return {
    external_lead_id: externalLeadId,
    external_created_at: new Date(),
    name: name || "Meta E2E Test Lead",
    email,
    phone: null,
    source: EXTERNAL_LEAD_SOURCE.META,
    type_id: typeId,
    external_form_id: formId,
    form_data: { email },
    additional_data: { campaign_name: "E2E Test Campaign" },
  };
}

async function pollEnrollments(workflowId, expectedCount, timeoutMs) {
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

async function createAndPublishWorkflow(name, recipientFilter) {
  let r = await api("POST", "/api/v1/workflows", { name });
  expect(r.status === 201, `create workflow: ${r.status}`);
  const id = r.body.workflow.id;

  r = await api("PUT", `/api/v1/workflows/${id}`, {
    trigger_config: {
      type: "trigger.new_lead",
      config: {
        recipient_filter: recipientFilter,
        allow_re_enrollment: false,
      },
    },
    // No email nodes — nothing is ever sent during this test.
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
  expect(r.status === 200, `update workflow: ${r.status} ${JSON.stringify(r.body)}`);

  r = await api("POST", `/api/v1/workflows/${id}/publish`);
  expect(r.status === 200, `publish workflow: ${r.status} ${JSON.stringify(r.body)}`);
  return id;
}

async function run() {
  const workflowIds = [];
  const insertedLeadIds = []; // external_lead_id values
  const createdTypeIds = [];

  try {
    // ================= PHASE 1 — form-specific workflow =================
    const wfForm = await createAndPublishWorkflow(
      `Meta Trigger Test (form) ${new Date().toISOString()}`,
      {
        sources: [
          {
            type: "external_leads",
            filters: { sources: [{ source: "meta", form_ids: [FORM_MATCH] }] },
          },
        ],
      }
    );
    workflowIds.push(wfForm);
    log("setup", `form-specific workflow ${wfForm} watching ${FORM_MATCH}`);

    // ---- Scenario 1: FORM MATCH (typeless lead, unmapped-form case) ----
    const lead1Id = `e2e-meta-${RUN}-1`;
    insertedLeadIds.push(lead1Id);
    await insertLikeSync([
      metaLeadRow({
        externalLeadId: lead1Id,
        email: `meta-match-${RUN}@example.invalid`,
        formId: FORM_MATCH,
        typeId: null, // unmapped form — leads sync without a type
      }),
    ]);
    log("match", `inserted typeless lead ${lead1Id} from ${FORM_MATCH}`);

    const formEnrollments = await pollEnrollments(wfForm, 1, 10000);
    expect(
      formEnrollments.length === 1,
      `form workflow: expected 1 enrollment, got ${formEnrollments.length}`
    );
    log("match", `typeless lead enrolled in form-specific workflow ✓`);

    // ---- Scenario 2: FORM MISS -----------------------------------------
    const lead2Id = `e2e-meta-${RUN}-2`;
    insertedLeadIds.push(lead2Id);
    await insertLikeSync([
      metaLeadRow({
        externalLeadId: lead2Id,
        email: `meta-other-${RUN}@example.invalid`,
        formId: FORM_OTHER,
        typeId: null,
      }),
    ]);
    log("miss", `inserted lead ${lead2Id} from non-watched form ${FORM_OTHER}`);

    await sleep(3000); // grace period for any (wrong) enrollment to appear
    const afterMiss = await WorkflowEnrollment.findAll({
      where: { workflow_id: wfForm },
    });
    expect(
      afterMiss.length === 1,
      `form workflow gained an enrollment from a non-watched form; ` +
        `expected 1, got ${afterMiss.length}`
    );
    log("miss", `non-watched form did not enroll ✓`);

    // ---- Scenario 3: SIBLING RACE (multi-type insert) -------------------
    // One Meta lead, two lead types, ONE bulkCreate — exactly what the sync
    // does for a form mapped to two types. Two evaluate jobs race; only one
    // enrollment may result. type_id has an FK, so create real lead types.
    const typeA = await ExternalLeadType.create({
      name: `E2E Type A ${RUN}`,
      description: "sandbox test type — safe to delete",
    });
    const typeB = await ExternalLeadType.create({
      name: `E2E Type B ${RUN}`,
      description: "sandbox test type — safe to delete",
    });
    createdTypeIds.push(typeA.id, typeB.id);

    const lead3Id = `e2e-meta-${RUN}-3`;
    insertedLeadIds.push(lead3Id);
    const raceEmail = `meta-race-${RUN}@example.invalid`;
    await insertLikeSync([
      metaLeadRow({
        externalLeadId: lead3Id,
        email: raceEmail,
        formId: FORM_MATCH,
        typeId: typeA.id,
      }),
      metaLeadRow({
        externalLeadId: lead3Id,
        email: raceEmail,
        formId: FORM_MATCH,
        typeId: typeB.id,
      }),
    ]);
    log("race", `inserted lead ${lead3Id} into 2 types in one bulkCreate`);

    await pollEnrollments(wfForm, 2, 10000); // wait for the new enrollment
    await sleep(2500); // grace period for a (wrong) duplicate to appear
    const raceEnrollments = await WorkflowEnrollment.findAll({
      where: { workflow_id: wfForm, lead_email_snapshot: raceEmail },
    });
    expect(
      raceEnrollments.length === 1,
      `sibling race: expected exactly 1 enrollment for ${raceEmail}, ` +
        `got ${raceEnrollments.length} — advisory lock / identity dedup failed`
    );
    log("race", `2 sibling rows → exactly 1 enrollment ✓`);

    // ================= PHASE 2 — wildcard workflow ======================
    // Created only now, so phase-1 leads were never candidates for it and
    // the active-workflow cap can't skew earlier assertions.
    const wfAny = await createAndPublishWorkflow(
      `Meta Trigger Test (wildcard) ${new Date().toISOString()}`,
      {
        sources: [
          {
            type: "external_leads",
            filters: { sources: [{ source: "meta" }] },
          },
        ],
      }
    );
    workflowIds.push(wfAny);
    log("setup", `wildcard workflow ${wfAny} watching any meta lead`);

    // ---- Scenario 4: WILDCARD ------------------------------------------
    // Lead from the non-watched form — only the wildcard workflow matches.
    const lead4Id = `e2e-meta-${RUN}-4`;
    insertedLeadIds.push(lead4Id);
    await insertLikeSync([
      metaLeadRow({
        externalLeadId: lead4Id,
        email: `meta-wild-${RUN}@example.invalid`,
        formId: FORM_OTHER,
        typeId: null,
      }),
    ]);
    log("wildcard", `inserted lead ${lead4Id} from ${FORM_OTHER}`);

    const anyEnrollments = await pollEnrollments(wfAny, 1, 10000);
    expect(
      anyEnrollments.length === 1,
      `wildcard workflow: expected 1 enrollment, got ${anyEnrollments.length}`
    );
    log("wildcard", `wildcard workflow enrolled the lead ✓`);

    const formFinal = await WorkflowEnrollment.findAll({
      where: { workflow_id: wfForm },
    });
    expect(
      formFinal.length === 2,
      `form workflow should still have 2 enrollments, got ${formFinal.length}`
    );

    console.log("\n✅ E2E Meta trigger test PASSED");
  } catch (err) {
    console.error("\n❌ E2E Meta trigger test FAILED");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    try {
      for (const id of workflowIds) {
        await api("DELETE", `/api/v1/workflows/${id}`);
      }
      if (insertedLeadIds.length) {
        await ExternalLead.destroy({
          where: { external_lead_id: insertedLeadIds },
        });
      }
      if (createdTypeIds.length) {
        await ExternalLeadType.destroy({ where: { id: createdTypeIds } });
      }
      log("cleanup", "done");
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(process.exitCode || 0);
  }
}

run();
