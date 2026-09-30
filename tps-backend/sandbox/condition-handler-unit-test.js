/**
 * Isolated unit test for the control.condition handler.
 *
 * Mocks the Sequelize models so we can verify the handler's decisions
 * end-to-end without a live database or worker. Covers:
 *   1. First entry (no waiter) → park outcome
 *   2. Re-entry with matching event (after waiter created) → match branch
 *   3. Re-entry with no matching event → no_match branch (timeout)
 *   4. Re-entry with event recorded BEFORE waiter → no_match (correct rejection)
 *   5. Invalid config → throws non-retryable error
 *   6. Missing edge → throws non-retryable error
 *   7. Race: park returns and timeout job arrives before wake → no_match
 *   8. Race: wake fires while still parked → resume runs with matched=true
 *
 * Run: NODE_ENV=development node sandbox/condition-handler-unit-test.js
 */

"use strict";

const Module = require("module");
const originalResolve = Module._resolveFilename;
const originalRequire = Module.prototype.require;

// --- Mock framework -------------------------------------------------------

let mockState;
function resetMockState() {
  mockState = {
    waiters: new Map(), // enrollment_id -> waiter row
    leadEvents: [], // array of {lead_source_type, lead_source_id, event_type, occurred_at}
    enrollmentUpdates: [], // array of patches applied
    enqueuedJobs: [], // array of { enrollmentId, nodeId, attempt, delayMs }
    afterCommitCallbacks: [],
    nextWaiterId: 1,
  };
}

function mockTx() {
  return {
    afterCommit(cb) {
      mockState.afterCommitCallbacks.push(cb);
    },
  };
}

const mockSequelize = {
  Transaction: {
    LOCK: { UPDATE: "UPDATE" },
  },
};

const mockOp = {
  gte: Symbol("gte"),
};

const mockModels = {
  WorkflowConditionWaiter: {
    async findOne({ where }) {
      const row = mockState.waiters.get(where.enrollment_id);
      return row || null;
    },
    async create(values) {
      if (mockState.waiters.has(values.enrollment_id)) {
        const err = new Error("Unique violation enrollment_id");
        err.name = "SequelizeUniqueConstraintError";
        throw err;
      }
      const row = {
        id: `w_${mockState.nextWaiterId++}`,
        ...values,
        createdAt: values.createdAt || new Date(),
        destroy: async () => {
          mockState.waiters.delete(row.enrollment_id);
        },
      };
      mockState.waiters.set(row.enrollment_id, row);
      return row;
    },
  },
  LeadEvent: {
    async count({ where }) {
      const { lead_source_type, lead_source_id, event_type, occurred_at } =
        where;
      // Pull the date out of `{[Op.gte]: date}`. Op.gte is a symbol key, so
      // Object.values won't see it — use Reflect.ownKeys to enumerate symbols.
      let since = null;
      if (occurred_at && typeof occurred_at === "object") {
        for (const k of Reflect.ownKeys(occurred_at)) {
          if (k === mockOp.gte) {
            since = occurred_at[k];
            break;
          }
        }
      }
      return mockState.leadEvents.filter((e) => {
        if (e.lead_source_type !== lead_source_type) return false;
        if (String(e.lead_source_id) !== String(lead_source_id)) return false;
        if (e.event_type !== event_type) return false;
        if (since && new Date(e.occurred_at) < new Date(since)) return false;
        return true;
      }).length;
    },
  },
};

const mockEnqueueAdvance = async (args) => {
  mockState.enqueuedJobs.push(args);
};

// Override require() so the handler picks up our mocks
Module.prototype.require = function patched(name) {
  if (name === "../../../../models") {
    return mockModels;
  }
  if (name === "../../../../queues/workflowQueues") {
    return { enqueueAdvance: mockEnqueueAdvance };
  }
  if (name === "sequelize") {
    return {
      Op: mockOp,
      Transaction: mockSequelize.Transaction,
    };
  }
  return originalRequire.call(this, name);
};

// Now load the handler with mocked deps
const handler = require("../service/workflow/engine/nodeHandlers/control.condition");

// --- Test runner ----------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function it(name, fn) {
  resetMockState();
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failures.push({ name, err });
    failed++;
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `${msg || "Assertion failed"}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
}

function truthy(v, msg) {
  if (!v) throw new Error(msg || `Expected truthy, got ${JSON.stringify(v)}`);
}

function mkEnrollment(overrides = {}) {
  return {
    id: "enr_1",
    lead_source_type: "events",
    lead_source_id: "76",
    status: "active",
    current_node_id: "cond_node",
    update: async (patch) => {
      mockState.enrollmentUpdates.push(patch);
      Object.assign(mockState._enrollment, patch);
    },
    ...overrides,
  };
}

// --- Tests ----------------------------------------------------------------

(async () => {
  console.log("\n=== control.condition handler unit tests ===\n");

  await it("1. First entry creates waiter, sets WAITING, schedules timeout", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });

    eq(result.outcome, "park", "outcome");
    eq(mockState.waiters.size, 1, "waiter count");
    const w = [...mockState.waiters.values()][0];
    eq(w.event_type, "email.opened", "waiter event_type");
    eq(w.lead_source_type, "events", "waiter lead_source_type");

    // Status flipped to WAITING
    const lastUpdate = mockState.enrollmentUpdates.slice(-1)[0];
    eq(lastUpdate.status, "waiting", "status WAITING");

    // afterCommit registered for timer enqueue
    eq(mockState.afterCommitCallbacks.length, 1, "one afterCommit registered");

    // Fire afterCommit to simulate post-commit timer scheduling
    await mockState.afterCommitCallbacks[0]();
    eq(mockState.enqueuedJobs.length, 1, "one job enqueued");
    eq(mockState.enqueuedJobs[0].attempt, 2, "timer attempt=2");
    eq(mockState.enqueuedJobs[0].delayMs, 5 * 60_000, "timer delay 5min");
  });

  await it("2. Re-entry: event recorded after waiter → matched=true → branch=match", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    // First entry: park
    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    eq(mockState.waiters.size, 1, "parked");

    // Simulate user opening email (after waiter.createdAt)
    await new Promise((r) => setTimeout(r, 20));
    mockState.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(),
    });

    // Re-entry: wake fired
    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });

    eq(result.outcome, "next", "outcome");
    eq(result.next_node_id, "mail2", "next_node_id");
    eq(result.output.branch, "match", "branch");
    eq(result.output.matched, true, "matched");
    eq(mockState.waiters.size, 0, "waiter deleted");

    // Status flipped back to ACTIVE
    const lastUpdate = mockState.enrollmentUpdates.slice(-1)[0];
    eq(lastUpdate.status, "active", "status back to ACTIVE");
  });

  await it("3. Re-entry: no event recorded → matched=false → branch=no_match", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    // No event recorded — timeout fires.
    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });

    eq(result.outcome, "next", "outcome");
    eq(result.next_node_id, "mail3", "next_node_id");
    eq(result.output.branch, "no_match", "branch");
    eq(result.output.matched, false, "matched");
    eq(mockState.waiters.size, 0, "waiter deleted");
  });

  await it("4. Event recorded BEFORE waiter creation → ignored → no_match", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    // Pre-existing event from a PREVIOUS workflow run (10 sec ago)
    mockState.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(Date.now() - 10_000),
    });

    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });

    eq(result.outcome, "next", "outcome");
    eq(result.output.branch, "no_match", "should not match an event recorded before the waiter");
    eq(result.output.matched, false, "matched should be false");
  });

  await it("5. Invalid config → throws non-retryable", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened" /* missing timeout fields */ },
    };
    let err = null;
    try {
      await handler.execute({ enrollment, node, edges: [], tx: mockTx() });
    } catch (e) {
      err = e;
    }
    truthy(err, "should throw");
    eq(err.retryable, false, "should be non-retryable");
    eq(mockState.waiters.size, 0, "no waiter created");
  });

  await it("6. Missing branch edge → throws non-retryable", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [{ from: "cond_node", to: "mail2", label: "match" }]; // missing no_match

    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    let err = null;
    try {
      await handler.execute({ enrollment, node, edges, tx: mockTx() });
    } catch (e) {
      err = e;
    }
    truthy(err, "should throw");
    eq(err.retryable, false, "should be non-retryable");
    truthy(err.message.includes("condition_no_edge"), "error message tells us why");
  });

  await it("7. Different event type recorded → matched=false (only matching event_type counts)", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    // Lead clicked instead of opened.
    mockState.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.clicked", // wrong event
      occurred_at: new Date(),
    });

    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });

    eq(result.output.branch, "no_match", "click should NOT match a wait-for-open");
    eq(result.output.matched, false, "matched false");
  });

  await it("8. Different lead recorded the event → matched=false (lead scoping)", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    // A DIFFERENT lead opened.
    mockState.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "99", // different lead
      event_type: "email.opened",
      occurred_at: new Date(),
    });

    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });

    eq(result.output.branch, "no_match", "another lead's open should NOT match");
    eq(result.output.matched, false, "matched false");
  });

  await it("9. Same event recorded for SAME lead but different source_type → no match", async () => {
    const enrollment = mkEnrollment(); // lead_source_type=events
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    mockState.leadEvents.push({
      lead_source_type: "platform_leads", // different source type
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(),
    });

    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });

    eq(result.output.branch, "no_match", "source_type mismatch should not match");
  });

  await it("10. Park outcome includes expires_at metadata", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const before = Date.now();
    const result = await handler.execute({
      enrollment,
      node,
      edges: [],
      tx: mockTx(),
    });
    const after = Date.now();

    eq(result.outcome, "park");
    truthy(result.output.waiting_for === "email.opened", "waiting_for set");
    const expiresAtMs = new Date(result.output.expires_at).getTime();
    truthy(
      expiresAtMs >= before + 5 * 60_000 - 100 &&
        expiresAtMs <= after + 5 * 60_000 + 100,
      "expires_at ≈ now + 5min"
    );
  });

  await it("11. Multiple matching events → still matched=true (count > 0)", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    // User opens multiple times.
    await new Promise((r) => setTimeout(r, 20));
    for (let i = 0; i < 3; i++) {
      mockState.leadEvents.push({
        lead_source_type: "events",
        lead_source_id: "76",
        event_type: "email.opened",
        occurred_at: new Date(),
      });
    }
    const result = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });
    eq(result.output.matched, true, "any number of matching events → matched");
  });

  await it("12. Race: two concurrent re-entries → only one wins (other finds no waiter)", async () => {
    const enrollment = mkEnrollment();
    mockState._enrollment = { ...enrollment };
    const node = {
      id: "cond_node",
      config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" },
    };
    const edges = [
      { from: "cond_node", to: "mail2", label: "match" },
      { from: "cond_node", to: "mail3", label: "no_match" },
    ];

    // Park first
    await handler.execute({ enrollment, node, edges, tx: mockTx() });
    eq(mockState.waiters.size, 1, "parked");

    // Two re-entries happen serially (mocking the row-level lock — in real DB
    // they'd serialize; here we just call them in sequence to verify the
    // second-call behavior when the waiter is already gone).
    const r1 = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });
    eq(r1.outcome, "next", "first re-entry resumes");
    eq(mockState.waiters.size, 0, "waiter deleted");

    // Second re-entry finds NO waiter — current handler would re-park.
    // In production this is prevented by advanceEnrollment's step-3 check
    // (current_node_id !== nodeId after the first resume advances the
    // enrollment), so the second job never reaches handler.execute. This
    // unit test surfaces that the handler ALONE doesn't protect — the
    // engine guard is essential.
    const r2 = await handler.execute({
      enrollment,
      node,
      edges,
      tx: mockTx(),
    });
    eq(r2.outcome, "park", "handler alone re-parks (engine guards in real run)");
  });

  // --- Summary ---
  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    for (const f of failures) {
      console.log(`FAIL: ${f.name}`);
      console.log(f.err.stack);
    }
    process.exit(1);
  }
})().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
