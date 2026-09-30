/**
 * Validation tests for the condition node + DAG.
 *
 * No mocks needed — pure logic.
 *
 * Run: node sandbox/condition-validation-test.js
 */

"use strict";

const { validateNodeConfig } = require("../service/workflow/validation/nodeConfigSchemas");
const { validateDefinition } = require("../service/workflow/validation/dagValidator");

let passed = 0, failed = 0;
const failures = [];

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failures.push({ name, err });
    failed++;
  }
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "ne"}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}
function assert(c, msg) { if (!c) throw new Error(msg || "fail"); }

console.log("\n=== Condition validation tests ===\n");

it("V1. valid condition config passes", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
  });
  eq(err, null, "no error");
});

it("V2. missing event_type rejected", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { timeout_value: 5, timeout_unit: "minutes" },
  });
  assert(err && /event_type/.test(err), `expected event_type error, got: ${err}`);
});

it("V3. missing timeout_value rejected", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { event_type: "email.opened", timeout_unit: "minutes" },
  });
  assert(err && /timeout_value/.test(err), `expected timeout_value error, got: ${err}`);
});

it("V4. missing timeout_unit rejected", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { event_type: "email.opened", timeout_value: 5 },
  });
  assert(err && /timeout_unit/.test(err), `expected timeout_unit error, got: ${err}`);
});

it("V5. disallowed event_type rejected (email.bounced not in picker)", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { event_type: "email.bounced", timeout_value: 5, timeout_unit: "minutes" },
  });
  assert(err && /not allowed/.test(err), `expected 'not allowed' error, got: ${err}`);
});

it("V6. invalid duration unit rejected", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "fortnights" },
  });
  assert(err && /timeout_unit/.test(err), `expected timeout_unit error, got: ${err}`);
});

it("V7. negative timeout rejected", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { event_type: "email.opened", timeout_value: -3, timeout_unit: "minutes" },
  });
  assert(err && /positive integer/.test(err), `expected positive integer error, got: ${err}`);
});

it("V8. zero timeout rejected", () => {
  const err = validateNodeConfig({
    type: "control.condition",
    config: { event_type: "email.opened", timeout_value: 0, timeout_unit: "minutes" },
  });
  assert(err && /positive integer/.test(err), `expected positive integer error, got: ${err}`);
});

it("V9. allowed events: opened, clicked, unsubscribed", () => {
  for (const ev of ["email.opened", "email.clicked", "email.unsubscribed"]) {
    const err = validateNodeConfig({
      type: "control.condition",
      config: { event_type: ev, timeout_value: 1, timeout_unit: "days" },
    });
    eq(err, null, `${ev} should pass`);
  }
});

// --- DAG-level ----

const validWorkflow = (cb) => ({
  trigger: { type: "trigger.static_list", config: {} },
  nodes: [
    { id: "n1", type: "action.send_email", config: { subject: "s", html_body: "b", from_email: "x@y.com", from_name: "n" } },
    { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
    { id: "n2", type: "action.send_email", config: { subject: "s", html_body: "b", from_email: "x@y.com", from_name: "n" } },
    { id: "n3", type: "action.send_email", config: { subject: "s", html_body: "b", from_email: "x@y.com", from_name: "n" } },
    { id: "exit", type: "control.goal", config: { goal_name: "completed" } },
  ],
  edges: cb([
    { from: "n1", to: "cond" },
    { from: "cond", to: "n2", label: "match" },
    { from: "cond", to: "n3", label: "no_match" },
    { from: "n2", to: "exit" },
    { from: "n3", to: "exit" },
  ]),
  entry_node_id: "n1",
});

it("D1. valid DAG with condition passes", () => {
  const wf = validWorkflow((e) => e);
  const res = validateDefinition(wf);
  if (!res.valid) throw new Error("expected valid: " + res.errors.join(" | "));
});

it("D2. condition with missing no_match edge → invalid", () => {
  const wf = validWorkflow((e) => e.filter((x) => x.label !== "no_match"));
  const res = validateDefinition(wf);
  assert(!res.valid, "should be invalid");
  assert(res.errors.some((s) => /match.*no_match/i.test(s)), "should mention match/no_match");
});

it("D3. condition with extra unlabeled edge → invalid (not exactly 2)", () => {
  const wf = validWorkflow((e) => [...e, { from: "cond", to: "exit" }]);
  const res = validateDefinition(wf);
  assert(!res.valid, "should be invalid — three outgoing edges");
});

it("D4. condition with both edges same label → invalid", () => {
  const wf = validWorkflow((e) =>
    e.map((x) => (x.from === "cond" ? { ...x, label: "match" } : x))
  );
  const res = validateDefinition(wf);
  assert(!res.valid, "should be invalid");
});

it("D5. condition with wrong-typed edge labels → invalid", () => {
  const wf = validWorkflow((e) =>
    e.map((x) =>
      x.from === "cond" && x.label === "match"
        ? { ...x, label: "matched" }
        : x.from === "cond" && x.label === "no_match"
        ? { ...x, label: "timeout" }
        : x
    )
  );
  const res = validateDefinition(wf);
  assert(!res.valid, "old 'matched'/'timeout' labels must be rejected");
});

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  for (const f of failures) console.log(f.err.stack);
  process.exit(1);
}
