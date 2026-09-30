/**
 * Branch validation and window arithmetic. No database, no Redis:
 *
 *   node src/test/workflowBranch.test.js
 *
 * The condition query itself needs rows and is covered by the end-to-end run;
 * what is worth testing in isolation is the part that decides *whether the
 * question is answerable at all* — a branch with one edge, an event type
 * nothing records, or a window that re-anchors every time it is checked.
 */

import assert from "node:assert";

import { validateWorkflow } from "../services/workflow/validate.js";
import {
  CONDITION_EVENT_TYPES,
  conditionWindowMs,
  conditionSince,
} from "../services/workflow/conditions.js";
import { resolveWindow } from "../services/workflow/nodes/branch.js";
import {
  WORKFLOW_TRIGGER_TYPE,
  WORKFLOW_NODE_TYPE,
  WORKFLOW_CONDITION_SINCE,
} from "../config/constants/workflow.js";
import { LEAD_EVENT_TYPE } from "../config/constants/leadEvent.js";

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

const expectError = (result, fragment) => {
  assert.equal(result.valid, false, "expected invalid, got valid");
  assert.ok(
    result.errors.some((e) => e.toLowerCase().includes(fragment.toLowerCase())),
    `expected an error mentioning "${fragment}", got:\n        ${result.errors.join("\n        ")}`,
  );
};

const DAY = 86_400_000;

/* ── fixtures ───────────────────────────────────────────────────────────── */

const emailNode = (id) => ({
  id,
  type: WORKFLOW_NODE_TYPE.SEND_EMAIL,
  config: {
    subject: "Hello",
    body: "<p>Hi</p>",
    senderEmail: "hello@thegradient.co.in",
  },
});

const branchNode = (id, overrides = {}) => ({
  id,
  type: WORKFLOW_NODE_TYPE.BRANCH,
  config: {
    eventType: LEAD_EVENT_TYPE.EVENT_REGISTERED,
    since: WORKFLOW_CONDITION_SINCE.PREVIOUS_STEP,
    timeoutValue: 5,
    timeoutUnit: "days",
    ...overrides,
  },
});

const exitNode = (id) => ({
  id,
  type: WORKFLOW_NODE_TYPE.EXIT,
  config: { reason: "done" },
});

/** send → branch → yes: exit · no: email → exit */
const branchingWorkflow = () => ({
  name: "Nudge",
  triggerType: WORKFLOW_TRIGGER_TYPE.NEW_ACTIVITY,
  triggerConfig: { sources: [{ type: "leads", filters: {} }] },
  definition: {
    nodes: [
      emailNode("n1"),
      branchNode("n2"),
      exitNode("n3"),
      emailNode("n4"),
      exitNode("n5"),
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3", label: "yes" },
      { from: "n2", to: "n4", label: "no" },
      { from: "n4", to: "n5" },
    ],
    entryNodeId: "n1",
  },
});

console.log("\nworkflow branch\n");

/* ── validation ─────────────────────────────────────────────────────────── */

test("a branching workflow with both edges is valid", () => {
  const result = validateWorkflow(branchingWorkflow());
  assert.deepEqual(result.errors, []);
});

test("refuses a branch with no 'no' edge", () => {
  const wf = branchingWorkflow();
  wf.definition.edges = wf.definition.edges.filter((e) => e.label !== "no");
  expectError(validateWorkflow(wf), '"no" path is not connected');
});

test("refuses a branch with no 'yes' edge", () => {
  const wf = branchingWorkflow();
  wf.definition.edges = wf.definition.edges.filter((e) => e.label !== "yes");
  expectError(validateWorkflow(wf), '"yes" path is not connected');
});

test("a step reachable only down the 'no' path is not an orphan", () => {
  // Reachability has to follow labelled edges too, or every if/then workflow
  // would be refused for steps that are perfectly reachable.
  const result = validateWorkflow(branchingWorkflow());
  assert.ok(
    !result.errors.some((e) => e.includes("not connected to the rest")),
    `unexpected orphan error: ${result.errors.join(" | ")}`,
  );
});

test("refuses an event type nothing records", () => {
  const wf = branchingWorkflow();
  // Opens are the obvious thing to reach for, and gradient records none.
  wf.definition.nodes[1].config.eventType = "email.opened";
  expectError(validateWorkflow(wf), "must be one of");
});

test("email.sent is not offered as a condition", () => {
  // Branching on an email *we* sent asks whether the previous step ran, which
  // the graph already guarantees.
  assert.ok(!CONDITION_EVENT_TYPES.includes(LEAD_EVENT_TYPE.EMAIL_SENT));
});

test("every condition event type is one the product actually records", () => {
  for (const type of CONDITION_EVENT_TYPES) {
    assert.ok(
      Object.values(LEAD_EVENT_TYPE).includes(type),
      `${type} is not a LEAD_EVENT_TYPE`,
    );
  }
});

test("refuses a branch with a missing timeout", () => {
  const wf = branchingWorkflow();
  delete wf.definition.nodes[1].config.timeoutValue;
  expectError(validateWorkflow(wf), '"timeoutValue" is required');
});

test("refuses a branch nested inside a cycle", () => {
  const wf = branchingWorkflow();
  wf.definition.edges.push({ from: "n5", to: "n2" });
  expectError(validateWorkflow(wf), "loop back");
});

/* ── window arithmetic ──────────────────────────────────────────────────── */

test("the window converts to milliseconds", () => {
  assert.equal(conditionWindowMs({ value: 2, unit: "days" }), 2 * DAY);
  assert.equal(conditionWindowMs({ value: 3, unit: "hours" }), 3 * 3_600_000);
});

test("'enrollmentStart' anchors on when they joined", () => {
  const enrolledAt = new Date("2026-01-01T00:00:00Z");
  const since = conditionSince(
    { since: WORKFLOW_CONDITION_SINCE.ENROLLMENT_START },
    { enrolledAt, context: { branch: { since: "2026-06-01T00:00:00Z" } } },
  );
  assert.equal(since.toISOString(), enrolledAt.toISOString());
});

test("'previousStep' anchors on the parked marker", () => {
  const since = conditionSince(
    { since: WORKFLOW_CONDITION_SINCE.PREVIOUS_STEP },
    {
      enrolledAt: new Date("2026-01-01T00:00:00Z"),
      context: { branch: { since: "2026-06-01T00:00:00Z" } },
    },
  );
  assert.equal(since.toISOString(), "2026-06-01T00:00:00.000Z");
});

test("a missing marker widens the window rather than closing it", () => {
  // Falling back to `now` would answer "no" for somebody who did the thing
  // yesterday. Falling back to enrolment can only ever over-match, which is the
  // safe direction to be wrong in.
  const enrolledAt = new Date("2026-01-01T00:00:00Z");
  const since = conditionSince(
    { since: WORKFLOW_CONDITION_SINCE.PREVIOUS_STEP },
    { enrolledAt, context: {} },
  );
  assert.equal(since.toISOString(), enrolledAt.toISOString());
});

/* ── the deadline must not drift ────────────────────────────────────────── */

test("a fresh visit opens a window of the configured length", () => {
  const now = Date.UTC(2026, 0, 1);

  const { since, deadline, fresh } = resolveWindow(
    branchNode("n2", { timeoutValue: 5, timeoutUnit: "days" }),
    { context: {} },
    now,
  );

  assert.equal(fresh, true);
  assert.equal(since.getTime(), now);
  assert.equal(deadline.getTime() - now, 5 * DAY);
});

test("re-visiting a parked branch keeps the original deadline", () => {
  /**
   * The bug this exists to catch. A parked enrolment is re-advanced every time
   * a matching event lands for that person, so re-anchoring the window on each
   * pass would push the deadline forward each time — a five-day window that
   * never expires, and a "no" branch that never fires.
   */
  const opened = Date.UTC(2026, 0, 1);
  const closes = opened + 5 * DAY;

  const enrollment = {
    context: {
      branch: {
        nodeId: "n2",
        since: new Date(opened).toISOString(),
        deadline: new Date(closes).toISOString(),
        eventType: LEAD_EVENT_TYPE.EVENT_REGISTERED,
      },
    },
  };

  // Checked again three days in, as a wake would.
  const { since, deadline, fresh } = resolveWindow(
    branchNode("n2"),
    enrollment,
    opened + 3 * DAY,
  );

  assert.equal(fresh, false);
  assert.equal(since.getTime(), opened, "the start moved");
  assert.equal(deadline.getTime(), closes, "the deadline drifted");
});

test("a second branch later in the journey opens its own window", () => {
  // The marker is keyed on node id, so a later if/then does not inherit the
  // first one's deadline — which would make it expire the moment it is reached.
  const opened = Date.UTC(2026, 0, 1);
  const later = opened + 10 * DAY;

  const enrollment = {
    context: {
      branch: {
        nodeId: "n2",
        since: new Date(opened).toISOString(),
        deadline: new Date(opened + DAY).toISOString(),
      },
    },
  };

  const { fresh, deadline } = resolveWindow(
    branchNode("n7", { timeoutValue: 2, timeoutUnit: "days" }),
    enrollment,
    later,
  );

  assert.equal(fresh, true);
  assert.equal(deadline.getTime(), later + 2 * DAY);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
