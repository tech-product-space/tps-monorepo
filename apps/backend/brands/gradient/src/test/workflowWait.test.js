/**
 * The wait node's deadline arithmetic. No database, no Redis:
 *
 *   node src/test/workflowWait.test.js
 *
 * This file exists because of a bug the unit tests could not have caught and
 * the end-to-end run found in about ninety seconds.
 *
 * `advanceEnrollment` returns as soon as a handler parks, leaving the cursor on
 * the waiting node — so `execute` is called *again* when the wait elapses. The
 * first version had no memory: it parked for another full duration every time.
 * Every journey with a wait step in it looped forever. The row kept saying "due
 * in three days", the queue kept honouring it, nothing errored, and the email
 * after the wait was never sent.
 *
 * That is the worst shape a bug can have here — silent, indefinite, and
 * indistinguishable from a wait that simply has not finished yet — so the
 * arithmetic now has a fast test of its own rather than living only in the
 * slow integration run.
 */

import assert from "node:assert";

import { durationMs, resolveDeadline, execute } from "../services/workflow/nodes/wait.js";
import { WORKFLOW_DURATION_UNIT } from "../config/constants/workflow.js";

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

const asyncTest = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const waitNode = (id, config) => ({ id, type: "wait", config });

/* ── durations ──────────────────────────────────────────────────────────── */

test("every unit converts", () => {
  assert.equal(durationMs({ value: 1, unit: WORKFLOW_DURATION_UNIT.MINUTES }), MINUTE);
  assert.equal(durationMs({ value: 2, unit: WORKFLOW_DURATION_UNIT.HOURS }), 2 * HOUR);
  assert.equal(durationMs({ value: 3, unit: WORKFLOW_DURATION_UNIT.DAYS }), 3 * DAY);
  assert.equal(durationMs({ value: 1, unit: WORKFLOW_DURATION_UNIT.WEEKS }), 7 * DAY);
});

test("an unknown unit is zero, not NaN", () => {
  // Zero parks and immediately resumes, which is visible and harmless. NaN
  // becomes an Invalid Date and strands the enrolment forever.
  assert.equal(durationMs({ value: 5, unit: "fortnights" }), 0);
});

/* ── the anchor ─────────────────────────────────────────────────────────── */

test("a first visit anchors the deadline on now", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  const { until, fresh } = resolveDeadline(
    waitNode("n1", { value: 3, unit: "days" }),
    { context: {} },
    now,
  );

  assert.equal(fresh, true);
  assert.equal(until.getTime(), now + 3 * DAY);
});

test("a second visit reuses the stored deadline rather than re-anchoring", () => {
  // The whole bug, in one assertion. Without the marker this returns
  // `later + 3 days` and the wait never ends.
  const opened = Date.UTC(2026, 0, 1, 12, 0, 0);
  const later = opened + 2 * DAY;

  const { until, fresh } = resolveDeadline(
    waitNode("n1", { value: 3, unit: "days" }),
    { context: { wait: { nodeId: "n1", until: new Date(opened + 3 * DAY).toISOString() } } },
    later,
  );

  assert.equal(fresh, false);
  assert.equal(until.getTime(), opened + 3 * DAY);
});

test("a marker left by a different wait node is ignored", () => {
  // Two waits in one journey. The second must start its own clock, not inherit
  // whatever the first one left behind.
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  const { until, fresh } = resolveDeadline(
    waitNode("n2", { value: 1, unit: "hours" }),
    { context: { wait: { nodeId: "n1", until: new Date(now + 10 * DAY).toISOString() } } },
    now,
  );

  assert.equal(fresh, true);
  assert.equal(until.getTime(), now + HOUR);
});

test("a branch marker on the same journey does not confuse a wait", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  const { fresh } = resolveDeadline(
    waitNode("n1", { value: 1, unit: "hours" }),
    { context: { branch: { nodeId: "n1", deadline: new Date(now + DAY).toISOString() } } },
    now,
  );

  assert.equal(fresh, true);
});

/* ── what the handler decides ───────────────────────────────────────────── */

await asyncTest("a fresh visit parks and writes the marker", async () => {
  const node = waitNode("n1", { value: 1, unit: "hours" });

  const result = await execute({ node, enrollment: { context: {} } });

  assert.equal(result.outcome, "park");
  assert.equal(result.context.wait.nodeId, "n1");
  assert.equal(
    new Date(result.context.wait.until).getTime(),
    result.runAt.getTime(),
    "the marker and the scheduled time must be the same instant",
  );
});

await asyncTest("an elapsed wait moves on and clears the marker", async () => {
  const node = waitNode("n1", { value: 1, unit: "hours" });
  const passedDeadline = new Date(Date.now() - MINUTE).toISOString();

  const result = await execute({
    node,
    enrollment: { context: { wait: { nodeId: "n1", until: passedDeadline } } },
  });

  assert.equal(result.outcome, "next");
  // Null deletes the key in `mergeContext`. Leaving it would make the *next*
  // wait node think it had already parked.
  assert.equal(result.context.wait, null);
});

await asyncTest("an early wake re-parks on the original deadline", async () => {
  // The reconcile cron rescuing a stranded row, or a duplicate job delivery.
  // Re-anchoring here would mean every rescue silently extends the wait it was
  // meant to repair.
  const node = waitNode("n1", { value: 3, unit: "days" });
  const original = new Date(Date.now() + 2 * DAY).toISOString();

  const result = await execute({
    node,
    enrollment: { context: { wait: { nodeId: "n1", until: original } } },
  });

  assert.equal(result.outcome, "park");
  assert.equal(result.runAt.getTime(), new Date(original).getTime());
});

await asyncTest("a wait never parks twice on the same deadline forever", async () => {
  /**
   * The regression, walked rather than asserted: park, jump to the deadline,
   * and confirm the second visit moves on. A loop bounded at five so a
   * reintroduced bug fails this test instead of hanging it.
   */
  const node = waitNode("n1", { value: 1, unit: "minutes" });

  let context = {};
  let moved = false;

  for (let i = 0; i < 5; i += 1) {
    const result = await execute({ node, enrollment: { context } });

    if (result.outcome === "next") {
      moved = true;
      break;
    }

    // Pretend the deadline arrived, exactly as the delayed job does.
    context = {
      wait: {
        nodeId: "n1",
        until: new Date(Date.now() - 1_000).toISOString(),
      },
    };
  }

  assert.ok(moved, "the wait never moved on — it is re-parking indefinitely");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
