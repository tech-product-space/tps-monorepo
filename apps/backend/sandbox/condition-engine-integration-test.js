/**
 * Integration test exercising advanceEnrollment + condition handler +
 * wakeWaiters together. Verifies the FULL flow the user cares about:
 *   - exactly one branch fires per enrollment
 *   - no double-send when wake and timeout race
 *   - the engine's current_node_id guard prevents duplicate advances
 *
 * Mocks the DB but preserves the real engine + handler logic.
 *
 * Run: node sandbox/condition-engine-integration-test.js
 */

"use strict";

const Module = require("module");
const originalRequire = Module.prototype.require;

let state;
function resetState() {
  state = {
    waiters: new Map(),
    leadEvents: [],
    nodeRuns: new Map(), // key: enr_id|node_id|attempt
    enrollments: new Map(),
    workflows: new Map(),
    versions: new Map(),
    enqueuedJobs: [], // {enrollmentId, nodeId, attempt, delayMs}
    sentEmails: [], // events for verification
    afterCommit: [],
    waiterId: 1,
    nodeRunId: 1,
  };
}

const mockOp = { gte: Symbol("gte"), ne: Symbol("ne") };

// --- Mock Sequelize-ish models ----------------------------------------

function mockTx() {
  return {
    afterCommit(cb) {
      state.afterCommit.push(cb);
    },
  };
}

async function flushAfterCommit() {
  const cbs = state.afterCommit.slice();
  state.afterCommit.length = 0;
  for (const cb of cbs) await cb();
}

const mockModels = {
  WorkflowEnrollment: {
    async findByPk(id) {
      const row = state.enrollments.get(id);
      if (!row) return null;
      // Return a proxy that supports .update() like Sequelize instance
      return wrapInstance(row, state.enrollments);
    },
  },
  Workflow: {
    async findByPk(id) {
      const wf = state.workflows.get(id);
      return wf || null;
    },
  },
  WorkflowVersion: {
    async findOne({ where }) {
      for (const v of state.versions.values()) {
        if (
          v.workflow_id === where.workflow_id &&
          v.version === where.version
        ) {
          return v;
        }
      }
      return null;
    },
  },
  WorkflowNodeRun: {
    async findOrCreate({ where, defaults }) {
      const key = `${where.enrollment_id}|${where.node_id}|${where.attempt}`;
      if (state.nodeRuns.has(key)) {
        const row = state.nodeRuns.get(key);
        return [wrapInstance(row, state.nodeRuns, key), false];
      }
      const row = {
        id: `nr_${state.nodeRunId++}`,
        ...where,
        ...defaults,
        output: defaults.output || {},
      };
      state.nodeRuns.set(key, row);
      return [wrapInstance(row, state.nodeRuns, key), true];
    },
  },
  WorkflowConditionWaiter: {
    async findOne({ where }) {
      const row = state.waiters.get(where.enrollment_id);
      if (!row) return null;
      return wrapInstance(row, state.waiters, where.enrollment_id, async (r) => {
        // destroy override
        state.waiters.delete(r.enrollment_id);
      });
    },
    async findAll({ where }) {
      const out = [];
      outer: for (const w of state.waiters.values()) {
        if (where.lead_source_type && w.lead_source_type !== where.lead_source_type)
          continue;
        if (
          where.lead_source_id &&
          String(w.lead_source_id) !== String(where.lead_source_id)
        )
          continue;
        if (where.event_type && w.event_type !== where.event_type) continue;
        if (where.expires_at) {
          for (const k of Reflect.ownKeys(where.expires_at)) {
            // {[Op.gt]: now} — keep waiter only if expires_at > now
            const cmp = where.expires_at[k];
            if (new Date(w.expires_at) <= new Date(cmp)) {
              continue outer;
            }
          }
        }
        out.push(w);
      }
      return out;
    },
    async create(values) {
      if (state.waiters.has(values.enrollment_id)) {
        const err = new Error("unique");
        err.name = "SequelizeUniqueConstraintError";
        throw err;
      }
      const row = {
        id: `w_${state.waiterId++}`,
        ...values,
        createdAt: new Date(),
      };
      state.waiters.set(row.enrollment_id, row);
      return row;
    },
  },
  LeadEvent: {
    async count({ where }) {
      let since = null;
      if (where.occurred_at && typeof where.occurred_at === "object") {
        for (const k of Reflect.ownKeys(where.occurred_at)) {
          if (k === mockOp.gte) since = where.occurred_at[k];
        }
      }
      return state.leadEvents.filter((e) => {
        if (e.lead_source_type !== where.lead_source_type) return false;
        if (String(e.lead_source_id) !== String(where.lead_source_id))
          return false;
        if (e.event_type !== where.event_type) return false;
        if (since && new Date(e.occurred_at) < new Date(since)) return false;
        return true;
      }).length;
    },
    async create(values) {
      const row = { ...values, id: `le_${state.leadEvents.length + 1}` };
      state.leadEvents.push(row);
      return row;
    },
  },
  sequelize: {
    async transaction(fn) {
      const tx = mockTx();
      const r = await fn(tx);
      await flushAfterCommit();
      return r;
    },
    Sequelize: { Op: mockOp },
  },
};

mockModels.sequelize.transaction = async function (fn) {
  const tx = mockTx();
  const r = await fn(tx);
  await flushAfterCommit();
  return r;
};

function wrapInstance(row, store, key = row.id, destroyHook) {
  const handle = {
    ...row,
    async update(patch) {
      Object.assign(row, patch);
      Object.assign(handle, patch);
      return handle;
    },
    async destroy() {
      if (destroyHook) await destroyHook(row);
      else store.delete(key);
    },
  };
  return handle;
}

// --- Mock queue ---------------------------------------------------------

const mockEnqueueAdvance = async ({ enrollmentId, nodeId, attempt = 1, delayMs = 0 }) => {
  // Deterministic dedup — mimic BullMQ deterministic jobId behavior
  const jobId = `${enrollmentId}:${nodeId}:${attempt}`;
  if (state.enqueuedJobs.some((j) => j.jobId === jobId)) return;
  state.enqueuedJobs.push({ jobId, enrollmentId, nodeId, attempt, delayMs });
};

// --- Hook require() to inject mocks ------------------------------------

Module.prototype.require = function (name) {
  // Match all relative-path variants that point at /models or /queues
  if (/(^|\/)\.\.(\/\.\.)*\/models$/.test(name) || name.endsWith("/models")) {
    return mockModels;
  }
  if (/queues\/workflowQueues$/.test(name)) {
    return { enqueueAdvance: mockEnqueueAdvance };
  }
  if (name === "sequelize") {
    return {
      Op: mockOp,
      Transaction: { LOCK: { UPDATE: "UPDATE" } },
    };
  }
  return originalRequire.call(this, name);
};

const { advanceEnrollment } = require("../service/workflow/engine/advanceEnrollment");
const { wakeWaiters } = require("../service/workflow/events/wakeWaiters");

// --- Setup helpers ------------------------------------------------------

function seedWorkflow({ workflowId, nodes, edges }) {
  state.workflows.set(workflowId, {
    id: workflowId,
    status: "active",
  });
  state.versions.set(`${workflowId}|1`, {
    workflow_id: workflowId,
    version: 1,
    definition: { nodes, edges },
  });
}

function seedEnrollment({ enrollmentId, workflowId, currentNodeId, leadSourceType, leadSourceId }) {
  state.enrollments.set(enrollmentId, {
    id: enrollmentId,
    workflow_id: workflowId,
    workflow_version: 1,
    lead_source_type: leadSourceType,
    lead_source_id: leadSourceId,
    status: "active",
    current_node_id: currentNodeId,
    context: {},
    enrolled_at: new Date(),
  });
}

// --- Test framework ----------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function it(name, fn) {
  resetState();
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "expected equal"}: got ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

// --- Tests --------------------------------------------------------------

(async () => {
  console.log("\n=== advanceEnrollment + condition + wakeWaiters integration ===\n");

  await it("E1. parking attempt → enrollment WAITING, timeout job enqueued", async () => {
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: { from_email: "x@y.com", from_name: "n", subject: "s", html_body: "b" } },
        { id: "mail3", type: "action.send_email", config: { from_email: "x@y.com", from_name: "n", subject: "s", html_body: "b" } },
      ],
      edges: [
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 },
    });

    const enr = state.enrollments.get("enr1");
    eq(enr.status, "waiting", "enrollment WAITING");
    eq(enr.current_node_id, "cond", "still on condition node");
    eq(state.waiters.size, 1, "waiter created");

    // Timeout job enqueued (attempt=2)
    const timer = state.enqueuedJobs.find((j) => j.attempt === 2 && j.nodeId === "cond");
    assert(timer, "timeout job present");
    eq(timer.delayMs, 5 * 60_000, "5 min delay");

    // nodeRun for attempt=1 should be COMPLETED with parked:true
    const nr = state.nodeRuns.get("enr1|cond|1");
    eq(nr.status, "completed", "nodeRun completed");
    eq(nr.output.parked, true, "parked flag");
  });

  await it("E2. wake job (attempt=3) advances to match branch", async () => {
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: {} },
        { id: "mail3", type: "action.send_email", config: {} },
      ],
      edges: [
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    // Park
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 },
    });

    // User opens email → event recorded AFTER waiter created
    await new Promise((r) => setTimeout(r, 10));
    state.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(),
    });

    // wakeWaiters fires
    await wakeWaiters({
      leadSourceType: "events",
      leadSourceId: "76",
      eventType: "email.opened",
    });

    // attempt=3 should be enqueued
    const wake = state.enqueuedJobs.find((j) => j.attempt === 3 && j.nodeId === "cond");
    assert(wake, "wake job enqueued");

    // Process the wake job
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 3 },
    });

    const enr = state.enrollments.get("enr1");
    eq(enr.status, "active", "back to ACTIVE");
    eq(enr.current_node_id, "mail2", "advanced to mail2 (match branch)");
    eq(state.waiters.size, 0, "waiter destroyed");

    // attempt=1 for mail2 should be enqueued
    const mailAdvance = state.enqueuedJobs.find((j) => j.nodeId === "mail2");
    assert(mailAdvance, "mail2 advance enqueued");
  });

  await it("E3. timeout job (attempt=2) AFTER wake already moved → bails 'already_advanced'", async () => {
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: {} },
        { id: "mail3", type: "action.send_email", config: {} },
      ],
      edges: [
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    // Park
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 },
    });

    // Lead opens → wake
    await new Promise((r) => setTimeout(r, 10));
    state.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(),
    });
    await wakeWaiters({
      leadSourceType: "events",
      leadSourceId: "76",
      eventType: "email.opened",
    });
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 3 },
    });

    // NOW the timeout job fires (after 5 min in real life). Enrollment is
    // on mail2 already. Timeout MUST bail without advancing to mail3.
    const enrBefore = { ...state.enrollments.get("enr1") };

    const result = await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 2 },
    });

    eq(result.skipped, "already_advanced", "timeout bails after wake");
    const enrAfter = state.enrollments.get("enr1");
    eq(enrAfter.current_node_id, enrBefore.current_node_id, "current_node unchanged");

    // Confirm mail3 was NEVER scheduled — only mail2 should be in the queue
    const mail3Job = state.enqueuedJobs.find((j) => j.nodeId === "mail3");
    assert(!mail3Job, "mail3 NEVER enqueued — this is the user's bug case");
  });

  await it("E4. NO event recorded → timeout (attempt=2) fires, takes no_match → mail3", async () => {
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: {} },
        { id: "mail3", type: "action.send_email", config: {} },
      ],
      edges: [
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 },
    });
    // Lead never opens. Timeout fires.
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 2 },
    });

    const enr = state.enrollments.get("enr1");
    eq(enr.status, "active", "back to ACTIVE");
    eq(enr.current_node_id, "mail3", "advanced to mail3 (no_match)");

    const mail2Job = state.enqueuedJobs.find((j) => j.nodeId === "mail2");
    assert(!mail2Job, "mail2 NEVER enqueued (no open, no match)");
  });

  await it("E5. wakeWaiters with no matching waiter is a no-op", async () => {
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    // No waiter exists.
    await wakeWaiters({
      leadSourceType: "events",
      leadSourceId: "76",
      eventType: "email.opened",
    });

    eq(state.enqueuedJobs.length, 0, "no jobs enqueued");
  });

  await it("E6. wakeWaiters does NOT wake an expired waiter", async () => {
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: {} },
        { id: "mail3", type: "action.send_email", config: {} },
      ],
      edges: [
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 },
    });

    // Manually expire the waiter (simulate 5 min passed)
    const w = [...state.waiters.values()][0];
    w.expires_at = new Date(Date.now() - 1000);

    // Now the lead opens — but too late.
    state.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(),
    });
    await wakeWaiters({
      leadSourceType: "events",
      leadSourceId: "76",
      eventType: "email.opened",
    });

    const wakeJob = state.enqueuedJobs.find((j) => j.attempt === 3 && j.nodeId === "cond");
    assert(!wakeJob, "expired waiter should not be woken — timer handles it");
  });

  await it("E7. lock the user's reported bug — mail2+mail3 cannot both fire", async () => {
    // EXACT shape of user's workflow: delay → mail1 → condition → mail2 / mail3
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "delay", type: "control.delay", config: { duration_value: 1, duration_unit: "minutes" } },
        { id: "mail1", type: "action.send_email", config: {} },
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: {} },
        { id: "mail3", type: "action.send_email", config: {} },
        { id: "exit", type: "control.goal", config: { goal_name: "completed" } },
      ],
      edges: [
        { from: "delay", to: "mail1" },
        { from: "mail1", to: "cond" },
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
        { from: "mail2", to: "exit" },
        { from: "mail3", to: "exit" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    // Park
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 },
    });
    // Lead opens
    await new Promise((r) => setTimeout(r, 10));
    state.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(),
    });
    await wakeWaiters({
      leadSourceType: "events",
      leadSourceId: "76",
      eventType: "email.opened",
    });
    // Wake processes
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 3 },
    });
    // Timeout fires later (in real life, 5 min later)
    await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 2 },
    });

    // Verify the enrollment only routed to mail2, never mail3.
    const allCondNodeRuns = [...state.nodeRuns.values()].filter((r) => r.node_id === "cond");
    const completedBranches = allCondNodeRuns
      .map((r) => r.output?.branch)
      .filter(Boolean);

    // Exactly ONE branch must have been chosen by the condition
    eq(completedBranches.length, 1, `exactly one branch should fire, got ${completedBranches.join(",")}`);
    eq(completedBranches[0], "match", "should be match (user opened)");

    // Mail2 enqueued, Mail3 NOT
    const mail2Job = state.enqueuedJobs.find((j) => j.nodeId === "mail2");
    const mail3Job = state.enqueuedJobs.find((j) => j.nodeId === "mail3");
    assert(mail2Job, "mail2 enqueued");
    assert(!mail3Job, "mail3 NEVER enqueued");
  });

  await it("E8. opposite case: NO open, timeout fires first → mail3, wake later finds enrollment moved", async () => {
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: {} },
        { id: "mail3", type: "action.send_email", config: {} },
      ],
      edges: [
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    // Park, then timeout fires (no open yet)
    await advanceEnrollment({ data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 } });
    await advanceEnrollment({ data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 2 } });

    eq(state.enrollments.get("enr1").current_node_id, "mail3", "no_match → mail3");

    // Now lead opens AFTER timeout, but the open event arrives. Make sure
    // it does not wake anything (waiter is already destroyed).
    state.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(),
    });
    await wakeWaiters({
      leadSourceType: "events",
      leadSourceId: "76",
      eventType: "email.opened",
    });
    const wakeJob = state.enqueuedJobs.find((j) => j.attempt === 3 && j.nodeId === "cond");
    assert(!wakeJob, "post-timeout open does not wake (waiter gone)");

    // No mail2 enqueued
    const mail2Job = state.enqueuedJobs.find((j) => j.nodeId === "mail2");
    assert(!mail2Job, "mail2 NEVER enqueued in this path");
  });

  await it("E9. Duplicate wake delivery (BullMQ same jobId) is a no-op", async () => {
    seedWorkflow({
      workflowId: "wf1",
      nodes: [
        { id: "cond", type: "control.condition", config: { event_type: "email.opened", timeout_value: 5, timeout_unit: "minutes" } },
        { id: "mail2", type: "action.send_email", config: {} },
        { id: "mail3", type: "action.send_email", config: {} },
      ],
      edges: [
        { from: "cond", to: "mail2", label: "match" },
        { from: "cond", to: "mail3", label: "no_match" },
      ],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "cond",
      leadSourceType: "events",
      leadSourceId: "76",
    });
    await advanceEnrollment({ data: { enrollment_id: "enr1", node_id: "cond", expected_attempt: 1 } });

    state.leadEvents.push({
      lead_source_type: "events",
      lead_source_id: "76",
      event_type: "email.opened",
      occurred_at: new Date(Date.now() + 10),
    });

    // Two opens fire wakeWaiters twice (multiple pixel hits, etc.)
    await wakeWaiters({ leadSourceType: "events", leadSourceId: "76", eventType: "email.opened" });
    await wakeWaiters({ leadSourceType: "events", leadSourceId: "76", eventType: "email.opened" });

    const wakeJobs = state.enqueuedJobs.filter((j) => j.attempt === 3 && j.nodeId === "cond");
    eq(wakeJobs.length, 1, "deterministic jobId dedupes");
  });

  await it("E10. Worker not restarted simulation: enrollment with unknown node_type fails", async () => {
    // If the user did NOT restart the worker after the rename, an old
    // workflow with control.wait_for_event would hit "unknown_node_type"
    seedWorkflow({
      workflowId: "wf1",
      nodes: [{ id: "wfev", type: "control.wait_for_event", config: {} }],
      edges: [],
    });
    seedEnrollment({
      enrollmentId: "enr1",
      workflowId: "wf1",
      currentNodeId: "wfev",
      leadSourceType: "events",
      leadSourceId: "76",
    });

    const result = await advanceEnrollment({
      data: { enrollment_id: "enr1", node_id: "wfev", expected_attempt: 1 },
    });

    eq(result.failed, "unknown_node_type", "unknown node fails enrollment cleanly");
    eq(state.enrollments.get("enr1").status, "failed", "enrollment FAILED");
  });

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
