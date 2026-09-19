/**
 * Validator checks. No database, no email — run it directly:
 *
 *   node src/test/workflowValidate.test.js
 *
 * Every case here is one of the refusals `WORKFLOW_AUTOMATION_PLAN.md` §16
 * lists for phase 2. The validator is the only thing standing between a
 * half-built graph and a live workflow mailing people, so each rule gets a test
 * that fails for the right reason rather than merely failing.
 */

import assert from "node:assert";

import { validateWorkflow, resolveEntryNode } from "../services/workflow/validate.js";
import {
  WORKFLOW_TRIGGER_TYPE,
  WORKFLOW_NODE_TYPE,
} from "../config/constants/workflow.js";

let passed = 0;
let failed = 0;

const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
};

/** Asserts that validation failed *for the stated reason*, not just that it failed. */
const expectError = (result, fragment) => {
  assert.equal(result.valid, false, "expected invalid, got valid");
  assert.ok(
    result.errors.some((e) => e.toLowerCase().includes(fragment.toLowerCase())),
    `expected an error mentioning "${fragment}", got:\n        ${result.errors.join("\n        ")}`,
  );
};

/* ── fixtures ───────────────────────────────────────────────────────────── */

const emailNode = (id = "n1") => ({
  id,
  type: WORKFLOW_NODE_TYPE.SEND_EMAIL,
  config: {
    subject: "Hello",
    body: "<p>Hi {{name}}</p>",
    senderEmail: "hello@thegradient.co.in",
  },
});

const waitNode = (id = "n2") => ({
  id,
  type: WORKFLOW_NODE_TYPE.WAIT,
  config: { value: 3, unit: "days" },
});

const exitNode = (id = "n3") => ({
  id,
  type: WORKFLOW_NODE_TYPE.EXIT,
  config: { reason: "completed" },
});

const validWorkflow = (overrides = {}) => ({
  name: "Nurture",
  triggerType: WORKFLOW_TRIGGER_TYPE.NEW_ACTIVITY,
  triggerConfig: { sources: [{ type: "leads", filters: {} }] },
  definition: {
    nodes: [emailNode(), waitNode(), exitNode()],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
    ],
    entryNodeId: null,
  },
  ...overrides,
});

/* ── the happy path ─────────────────────────────────────────────────────── */

console.log("\nworkflow validator\n");

test("a linear send -> wait -> exit workflow is valid", () => {
  const result = validateWorkflow(validWorkflow());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("the entry node is inferred when nothing points at it", () => {
  const entry = resolveEntryNode(validWorkflow().definition);
  assert.equal(entry.id, "n1");
});

test("an explicit entryNodeId is honoured", () => {
  const wf = validWorkflow();
  wf.definition.entryNodeId = "n1";
  assert.equal(resolveEntryNode(wf.definition).id, "n1");
});

/* ── trigger ────────────────────────────────────────────────────────────── */

test("refuses a workflow with no trigger", () => {
  expectError(validateWorkflow(validWorkflow({ triggerType: null })), "pick a trigger");
});

test("refuses a realtime trigger watching nothing", () => {
  expectError(
    validateWorkflow(validWorkflow({ triggerConfig: { sources: [] } })),
    "at least one thing",
  );
});

test("refuses a source no resolver can handle", () => {
  expectError(
    validateWorkflow(
      validWorkflow({ triggerConfig: { sources: [{ type: "carrierPigeons" }] } }),
    ),
    "cannot watch",
  );
});

test("refuses a static list with no audience", () => {
  expectError(
    validateWorkflow(
      validWorkflow({
        triggerType: WORKFLOW_TRIGGER_TYPE.STATIC_LIST,
        triggerConfig: { recipientFilters: { include: [] } },
      }),
    ),
    "choose an audience",
  );
});

test("accepts a static list pointed at a real resolver", () => {
  const result = validateWorkflow(
    validWorkflow({
      triggerType: WORKFLOW_TRIGGER_TYPE.STATIC_LIST,
      triggerConfig: {
        recipientFilters: { include: [{ type: "leads", filters: {} }], exclude: [] },
      },
    }),
  );
  assert.deepEqual(result.errors, []);
});

/**
 * The exclude side was unchecked until an exclusion nothing could resolve got
 * published. `buildRecipients` throws on an unknown source rather than skipping
 * it — so the failure landed inside the bulk-enrol job, three retries after the
 * admin had been told the Run started, with nobody enrolled and nothing said.
 */
test("refuses a static list whose exclusion nothing can resolve", () => {
  expectError(
    validateWorkflow(
      validWorkflow({
        triggerType: WORKFLOW_TRIGGER_TYPE.STATIC_LIST,
        triggerConfig: {
          recipientFilters: {
            include: [{ type: "leads", filters: {} }],
            exclude: [{ type: "carrierPigeons", filters: {} }],
          },
        },
      }),
    ),
    "cannot resolve",
  );
});

test("names the exclusion that cannot be resolved, not merely its position", () => {
  const result = validateWorkflow(
    validWorkflow({
      triggerType: WORKFLOW_TRIGGER_TYPE.STATIC_LIST,
      triggerConfig: {
        recipientFilters: {
          include: [{ type: "leads", filters: {} }],
          exclude: [{ type: "carrierPigeons", filters: {} }],
        },
      },
    }),
  );

  assert.ok(
    result.errors.some((e) => e.includes("carrierPigeons")),
    `expected the source to be named, got: ${result.errors.join("; ")}`,
  );
});

test("refuses an exclusion that is not a list", () => {
  expectError(
    validateWorkflow(
      validWorkflow({
        triggerType: WORKFLOW_TRIGGER_TYPE.STATIC_LIST,
        triggerConfig: {
          recipientFilters: {
            include: [{ type: "leads", filters: {} }],
            exclude: { type: "leads" },
          },
        },
      }),
    ),
    "must be a list",
  );
});

/* ── steps ──────────────────────────────────────────────────────────────── */

test("refuses an empty workflow", () => {
  expectError(
    validateWorkflow(validWorkflow({ definition: { nodes: [], edges: [] } })),
    "at least one step",
  );
});

test("refuses a step type with no handler", () => {
  const wf = validWorkflow();
  wf.definition.nodes[1].type = "sendWhatsapp";
  expectError(validateWorkflow(wf), "not a step this system can run");
});

test("refuses a send with no subject", () => {
  const wf = validWorkflow();
  delete wf.definition.nodes[0].config.subject;
  expectError(validateWorkflow(wf), '"subject" is required');
});

test("refuses a wait with an unknown unit", () => {
  const wf = validWorkflow();
  wf.definition.nodes[1].config.unit = "fortnights";
  expectError(validateWorkflow(wf), "must be one of");
});

test("refuses a wait of zero", () => {
  const wf = validWorkflow();
  wf.definition.nodes[1].config.value = 0;
  expectError(validateWorkflow(wf), "at least 1");
});

test("refuses two steps sharing an id", () => {
  const wf = validWorkflow();
  wf.definition.nodes[1].id = "n1";
  expectError(validateWorkflow(wf), "share the id");
});

test("refuses a workflow that never sends anything", () => {
  const wf = validWorkflow();
  wf.definition.nodes = [waitNode("n2"), exitNode("n3")];
  wf.definition.edges = [{ from: "n2", to: "n3" }];
  expectError(validateWorkflow(wf), "never sends anything");
});

/* ── shape ──────────────────────────────────────────────────────────────── */

test("refuses a cycle", () => {
  const wf = validWorkflow();
  wf.definition.edges.push({ from: "n3", to: "n1" });
  expectError(validateWorkflow(wf), "loop back");
});

test("refuses an unreachable step", () => {
  const wf = validWorkflow();
  wf.definition.nodes.push(emailNode("orphan"));
  wf.definition.entryNodeId = "n1";
  expectError(validateWorkflow(wf), "not connected");
});

test("refuses an edge pointing at a step that does not exist", () => {
  const wf = validWorkflow();
  wf.definition.edges.push({ from: "n3", to: "ghost" });
  expectError(validateWorkflow(wf), "does not exist");
});

test("refuses an ambiguous start — two steps with nothing pointing at them", () => {
  const wf = validWorkflow();
  wf.definition.nodes.push(emailNode("n4"));
  expectError(validateWorkflow(wf), "which step comes first");
});

/* ── every error, not the first ─────────────────────────────────────────── */

test("reports every problem at once, not one per round trip", () => {
  const result = validateWorkflow({
    name: "Broken",
    triggerType: null,
    definition: { nodes: [{ id: "n1", type: "wait", config: {} }], edges: [] },
  });

  assert.ok(
    result.errors.length >= 3,
    `expected several errors, got ${result.errors.length}: ${result.errors.join(" | ")}`,
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
