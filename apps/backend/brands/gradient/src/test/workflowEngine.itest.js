/**
 * Workflow engine verification — the §16 tests, run for real.
 *
 * Drives the engine directly rather than through HTTP, so no admin token is
 * needed and each assertion sits next to the row it is about. The worker must
 * already be running in its own process (`node src/worker.js`).
 *
 * Nothing here sends email. Run with `--email <address>` to include the send
 * tests; without it those are skipped and reported as skipped, not passed.
 */

import "dotenv/config";

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1] ?? null;
const emailTo = args[args.indexOf("--email") + 1];
const withEmail = args.includes("--email") && emailTo && !emailTo.startsWith("--");

import db from "../database/postgres/models/index.js";
import { publishWorkflow } from "../services/workflow/publish.service.js";
import { enrolPerson } from "../services/workflow/enrollment.service.js";
import { recordLeadEvent } from "../services/leadEvent/recordLeadEvent.service.js";
import * as queues from "../queues/workflowQueues.js";
import { QUEUE_NAMES } from "../queues/workflowQueues.js";
import { reconcileEnrollments } from "../workers/reconcile.js";
import { WORKFLOW_STATUS } from "../config/constants/workflow.js";
import { EMAIL_PROVIDER_ID } from "../services/email/config/constants.js";

/**
 * The sender every fixture uses.
 *
 * A configured provider identity, not a plausible-looking address: `sendMail`
 * resolves `fromEmail` against `EMAIL_ACCOUNTS`, so an address that is merely
 * spelled correctly falls through to the first provider that will take it. The
 * SES noreply identity is the one automation mail should go out as.
 */
const SENDER = process.env.WF_VERIFY_SENDER || EMAIL_PROVIDER_ID.GD_NORP_MAIL;

const {
  Workflow,
  WorkflowEnrollment,
  WorkflowNodeRun,
  WorkflowVersion,
  LeadEvent,
} = db;

/* ── tiny harness ────────────────────────────────────────────────────────── */

const results = [];
let currentTest = null;

const log = (...a) => console.log(...a);

const check = (label, ok, detail = "") => {
  results.push({ test: currentTest, label, ok, detail });
  log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const test = async (name, fn) => {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  currentTest = name;
  log(`\n── ${name} ──`);
  try {
    await fn();
  } catch (error) {
    check("threw", false, error.message);
    console.error(error);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until `fn()` is truthy, or give up. Beats a fixed sleep. */
const until = async (fn, { timeoutMs = 90_000, everyMs = 1_000, what = "" } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    }
    await sleep(everyMs);
  }
};

const STAMP = Date.now().toString(36);
const created = [];

const node = (id, type, config) => ({ id, type, config, position: { x: 0, y: 0 } });

/**
 * A send step, and an exit after it.
 *
 * Every fixture below carries one because the publish validator refuses a
 * workflow that sends nothing - correctly: a graph of trigger, wait and exit
 * runs happily, enrols people and mails none of them, and looks exactly like a
 * delivery bug.
 *
 * Every fixture also arranges never to *reach* it inside the test window, so
 * these tests exercise the whole engine without a single real send. The one
 * test that must send says so in its name.
 */
const parkedSend = (id = "send", exitId = "send-exit") => [
  node(id, "sendEmail", {
    subject: "[WF-VERIFY] never reached",
    body: "<p>If this arrives, a fixture walked further than it should have.</p>",
    senderEmail: SENDER,
    senderName: "Verification",
  }),
  node(exitId, "exit", { reason: "unreachable-in-test" }),
];

/** Builds, saves and publishes a throwaway workflow. */
const makeWorkflow = async (name, definition) => {
  const workflow = await Workflow.create({
    name: `[WF-VERIFY ${STAMP}] ${name}`,
    description: "Temporary — created by the verification harness",
    triggerType: "staticList",
    // A real audience is never resolved: every enrolment below is explicit.
    triggerConfig: { recipientFilters: { include: [{ type: "leads", filters: {} }], exclude: [] } },
    definition,
  });

  created.push(workflow.id);

  const result = await publishWorkflow(workflow, { publishedBy: null });

  if (!result.published) {
    throw new Error(`publish refused: ${JSON.stringify(result.errors)}`);
  }

  return workflow.reload();
};

const runsFor = (enrollmentId) =>
  WorkflowNodeRun.findAll({
    where: { enrollmentId },
    order: [["startedAt", "ASC"]],
  });

const addr = (label) => `wf-verify+${STAMP}-${label}@example.invalid`;

/* ══ 1. a journey walks end to end ═══════════════════════════════════════ */

await test("journey walks end to end", async () => {
  const workflow = await makeWorkflow("linear", {
    entryNodeId: "a",
    nodes: [
      node("a", "wait", { value: 1, unit: "minutes" }),
      // Six hours: reached during the test, and parks there for the rest of it.
      node("b", "wait", { value: 6, unit: "hours" }),
      ...parkedSend(),
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "send" },
      { from: "send", to: "send-exit" },
    ],
  });

  check("published", workflow.status === WORKFLOW_STATUS.ACTIVE && workflow.currentVersion === 1,
    `status=${workflow.status} v=${workflow.currentVersion}`);

  const outcome = await enrolPerson({ workflow, email: addr("linear"), name: "Linear Test" });

  check("enrolled", outcome.enrolled, outcome.reason ?? "");
  if (!outcome.enrolled) return;

  const id = outcome.enrollment.id;

  // The wait must actually park rather than run straight through.
  const parked = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    // The marker, not `nextRunAt`: enrolling already sets a due time and a job
    // id, so polling those matches before the wait node has run at all.
    return row.context?.wait?.nodeId === "a" ? row : null;
  }, { timeoutMs: 30_000, what: "the wait to park" });

  const waitMs = new Date(parked.nextRunAt).getTime() - Date.now();

  check("waits about a minute, not zero", waitMs > 40_000 && waitMs <= 61_000,
    `${Math.round(waitMs / 1000)}s away`);
  check("a delayed job was written", Boolean(parked.jobId), `jobId=${parked.jobId}`);

  log("   … waiting out the 1-minute wait");

  const advanced = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    return row.currentNodeId === "b" ? row : null;
  }, { timeoutMs: 120_000, everyMs: 2_000, what: "the wait to elapse" });

  const nextWait = new Date(advanced.nextRunAt).getTime() - Date.now();

  check("moved on by itself when the wait elapsed", advanced.currentNodeId === "b");
  check("the next wait is scheduled six hours out", nextWait > 5.5 * 3_600_000,
    `${(nextWait / 3_600_000).toFixed(1)}h away`);

  const runs = await runsFor(id);
  const firstWait = runs.filter((r) => r.nodeId === "a");

  // Two visits by design: one that parks, one that finds the deadline passed
  // and moves on. The same shape as a branch that parks and then resolves.
  check("the wait parked once and resumed once", firstWait.length === 2,
    firstWait.map((r) => Object.keys(r.output ?? {}).join("+")).join(" then "));
  check("it resumed on the original deadline, not a fresh one",
    Boolean(firstWait[1]?.output?.waitedUntil) &&
      Math.abs(
        new Date(firstWait[1].output.waitedUntil).getTime() -
          new Date(firstWait[0].output.waitingUntil).getTime(),
      ) < 1_000,
    `${firstWait[0]?.output?.waitingUntil} -> ${firstWait[1]?.output?.waitedUntil}`);
  check("nothing was sent", !runs.some((r) => r.nodeType === "sendEmail"));
});

/* ══ 2. the enrolment gates ══════════════════════════════════════════════ */

await test("enrolment gates", async () => {
  const workflow = await makeWorkflow("gates", {
    entryNodeId: "a",
    nodes: [node("a", "wait", { value: 6, unit: "hours" }), ...parkedSend()],
    edges: [
      { from: "a", to: "send" },
      { from: "send", to: "send-exit" },
    ],
  });

  const email = addr("gates");

  const first = await enrolPerson({ workflow, email });
  check("first enrolment succeeds", first.enrolled, first.reason ?? "");

  const second = await enrolPerson({ workflow, email });
  check("same person is refused while live", !second.enrolled && second.reason === "alreadyInThisWorkflow",
    `reason=${second.reason}`);

  // The cap: a second workflow must refuse them while the first still holds
  // them, and the refusal must say which rule bit.
  const other = await makeWorkflow("gates-other", {
    entryNodeId: "a",
    nodes: [node("a", "wait", { value: 6, unit: "hours" }), ...parkedSend()],
    edges: [
      { from: "a", to: "send" },
      { from: "send", to: "send-exit" },
    ],
  });

  const capped = await enrolPerson({ workflow: other, email });
  check("the one-workflow cap holds", !capped.enrolled && capped.reason === "capped",
    `reason=${capped.reason}`);

  const noEmail = await enrolPerson({ workflow, email: "" });
  check("no address is refused by name", !noEmail.enrolled && noEmail.reason === "noEmail",
    `reason=${noEmail.reason}`);

  const unpublished = await Workflow.create({
    name: `[WF-VERIFY ${STAMP}] draft`,
    definition: { nodes: [], edges: [], entryNodeId: null },
  });
  created.push(unpublished.id);

  const draft = await enrolPerson({ workflow: unpublished, email: addr("draft") });
  check("a draft enrols nobody", !draft.enrolled && draft.reason === "notPublished",
    `reason=${draft.reason}`);
});

/* ══ 3. branch — yes on the event, no on the timeout ═════════════════════ */

await test("branch answers yes when the event lands", async () => {
  const workflow = await makeWorkflow("branch-yes", {
    entryNodeId: "q",
    nodes: [
      node("q", "branch", {
        eventType: "event.registered",
        since: "enrollmentStart",
        timeoutValue: 10,
        timeoutUnit: "minutes",
      }),
      node("y", "exit", { reason: "said-yes" }),
      // The no path is the one carrying the send, and this test takes yes.
      node("n", "wait", { value: 6, unit: "hours" }),
      ...parkedSend(),
    ],
    edges: [
      { from: "q", to: "y", label: "yes" },
      { from: "q", to: "n", label: "no" },
      { from: "n", to: "send" },
      { from: "send", to: "send-exit" },
    ],
  });

  const email = addr("branch-yes");
  const outcome = await enrolPerson({ workflow, email });
  check("enrolled", outcome.enrolled, outcome.reason ?? "");
  if (!outcome.enrolled) return;

  const id = outcome.enrollment.id;

  const parked = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    return row.status === "waiting" ? row : null;
  }, { timeoutMs: 30_000, what: "the branch to park" });

  check("parks as waiting, not active", parked.status === "waiting");
  check("marker records the window", parked.context?.branch?.nodeId === "q",
    JSON.stringify(parked.context?.branch ?? null));

  const deadline = new Date(parked.context.branch.deadline).getTime() - Date.now();
  check("deadline is ~10 minutes out", deadline > 8 * 60_000 && deadline <= 10 * 60_000,
    `${Math.round(deadline / 60_000)}min`);

  // Now they do the thing. The wake should resolve it long before the deadline.
  await recordLeadEvent({
    email,
    eventType: "event.registered",
    sourceType: "eventGuests",
    sourceId: `verify-${STAMP}`,
    metadata: { verification: true },
  });

  const resolved = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    return row.status === "completed" ? row : null;
  }, { timeoutMs: 60_000, everyMs: 1_000, what: "the wake to resolve the branch" });

  check("took the yes edge", resolved.endReason === "goal", `endReason=${resolved.endReason}`);
  check("marker cleared on the way out", !resolved.context?.branch,
    JSON.stringify(resolved.context ?? {}));

  const runs = await runsFor(id);
  const answers = runs.filter((r) => r.nodeType === "branch").map((r) => r.output?.answer);

  check("branch recorded waiting then yes", answers.includes("waiting") && answers.includes("yes"),
    answers.join(" → "));

  const exits = runs.filter((r) => r.nodeType === "exit");
  check("landed on the yes exit", exits.length === 1 && exits[0].nodeId === "y",
    exits.map((e) => e.nodeId).join(","));
});

await test("branch answers no when the window closes", async () => {
  const workflow = await makeWorkflow("branch-no", {
    entryNodeId: "q",
    nodes: [
      node("q", "branch", {
        eventType: "event.registered",
        since: "enrollmentStart",
        // The floor the constants allow, so this test is a minute rather than
        // a day. `seconds` is deliberately not a unit.
        timeoutValue: 1,
        timeoutUnit: "minutes",
      }),
      // Mirror of the test above: the send hangs off the path not taken.
      node("y", "wait", { value: 6, unit: "hours" }),
      node("n", "exit", { reason: "said-no" }),
      ...parkedSend(),
    ],
    edges: [
      { from: "q", to: "y", label: "yes" },
      { from: "q", to: "n", label: "no" },
      { from: "y", to: "send" },
      { from: "send", to: "send-exit" },
    ],
  });

  const outcome = await enrolPerson({ workflow, email: addr("branch-no") });
  check("enrolled", outcome.enrolled, outcome.reason ?? "");
  if (!outcome.enrolled) return;

  const id = outcome.enrollment.id;

  log("   … waiting out the 1-minute window");

  const done = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    return row.status === "completed" ? row : null;
  }, { timeoutMs: 150_000, everyMs: 2_000, what: "the window to close" });

  const runs = await runsFor(id);
  const exits = runs.filter((r) => r.nodeType === "exit");

  check("took the no edge", exits.length === 1 && exits[0].nodeId === "n",
    exits.map((e) => e.nodeId).join(","));
  check("branch answered no", runs.some((r) => r.output?.answer === "no"));
});

/* ══ 4. flush Redis mid-journey — the reconcile cron rescues ═════════════ */

await test("reconcile rescues a stranded enrolment", async () => {
  const workflow = await makeWorkflow("reconcile", {
    entryNodeId: "a",
    nodes: [
      node("a", "wait", { value: 1, unit: "minutes" }),
      node("b", "wait", { value: 6, unit: "hours" }),
      ...parkedSend(),
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "send" },
      { from: "send", to: "send-exit" },
    ],
  });

  const outcome = await enrolPerson({ workflow, email: addr("reconcile") });
  check("enrolled", outcome.enrolled, outcome.reason ?? "");
  if (!outcome.enrolled) return;

  const id = outcome.enrollment.id;

  const parked = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    return row.context?.wait?.nodeId === "a" && row.jobId ? row : null;
  }, { timeoutMs: 30_000, what: "the wait to park" });

  const strandedJobId = parked.jobId;

  // Kill the job the way a Redis flush would: the row still says where the
  // person is, and nothing in Redis will ever wake them.
  const queue = queues.getQueue(QUEUE_NAMES.ADVANCE);
  const job = await queue.getJob(strandedJobId);

  check("the delayed job existed before we removed it", Boolean(job), strandedJobId);

  // `force`, because a job a worker is mid-way through refuses removal — and
  // "a worker already has it" is not the situation this test is about.
  await job?.remove({ removeChildren: false }).catch(async () => {
    await queue.remove(strandedJobId, { removeChildren: false });
  });

  check("the job is gone from Redis", !(await queue.getJob(strandedJobId)));

  // Backdate past the cron's grace window so this run is the one that finds it,
  // rather than waiting five real minutes for the second sweep.
  await WorkflowEnrollment.update(
    { nextRunAt: new Date(Date.now() - 10 * 60_000) },
    { where: { id } },
  );

  const summary = await reconcileEnrollments();

  check("the cron noticed and re-queued", summary.rescued >= 1,
    `checked=${summary.checked} rescued=${summary.rescued}`);

  const rescued = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    return row.currentNodeId === "b" ? row : null;
  }, { timeoutMs: 90_000, everyMs: 2_000, what: "the rescued journey to move on" });

  check("the person kept moving anyway", rescued.currentNodeId === "b",
    `currentNodeId=${rescued.currentNodeId}`);
});

/* ══ 5. the realtime trigger path ════════════════════════════════════════ */

await test("a realtime trigger enrols on arrival", async () => {
  const { Lead } = db;

  const workflow = await makeWorkflow("realtime", {
    entryNodeId: "a",
    nodes: [node("a", "wait", { value: 6, unit: "hours" }), ...parkedSend()],
    edges: [
      { from: "a", to: "send" },
      { from: "send", to: "send-exit" },
    ],
  });

  // Republished as a realtime trigger, since makeWorkflow builds static lists.
  await workflow.update({
    triggerType: "newActivity",
    triggerConfig: { sources: [{ type: "leads", filters: {} }], allowReEnrollment: false },
  });

  const republished = await publishWorkflow(workflow, {});
  check("republished as realtime", republished.published,
    JSON.stringify(republished.errors ?? []));

  const email = addr("realtime");

  // The hook on Lead.afterCreate is the thing under test — nothing here
  // enqueues a trigger by hand.
  const lead = await Lead.create({
    name: "Realtime Verify",
    email,
    phone: "0000000000",
    source: `wf-verify-${STAMP}`,
    subSource: "harness",
  });

  const enrolled = await until(async () => {
    const row = await WorkflowEnrollment.findOne({
      where: { workflowId: workflow.id, email },
    });
    return row;
  }, { timeoutMs: 45_000, what: "the lead hook to enrol them" });

  check("enrolled by the model hook", Boolean(enrolled),
    `source=${enrolled?.enrollmentSource}`);
  check("recorded as a realtime enrolment", enrolled?.enrollmentSource === "newActivity",
    `${enrolled?.enrollmentSource}`);

  const event = await LeadEvent.findOne({
    where: { email, eventType: "lead.created" },
  });
  check("a lead_event was recorded too", Boolean(event));

  await lead.destroy();
});

/* ══ 6. the send, and that a redelivered job does not repeat it ══════════ */

await test("a redelivered advance job sends once", async () => {
  if (!withEmail) {
    log("   SKIP — no --email address given. Send-idempotency is unproven.");
    results.push({ test: currentTest, label: "send idempotency", ok: null, detail: "skipped" });
    return;
  }

  const workflow = await makeWorkflow("send-once", {
    entryNodeId: "a",
    nodes: [
      node("a", "sendEmail", {
        subject: `[WF-VERIFY ${STAMP}] this must arrive exactly once`,
        body: "<p>If you have two of these, the row lock in advanceEnrollment is not holding.</p>",
        senderEmail: SENDER,
        senderName: "Workflow Verification",
      }),
      node("b", "wait", { value: 6, unit: "hours" }),
      node("c", "exit", { reason: "verified" }),
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
  });

  const outcome = await enrolPerson({ workflow, email: emailTo, name: "Verification" });
  check("enrolled", outcome.enrolled, outcome.reason ?? "");
  if (!outcome.enrolled) return;

  const id = outcome.enrollment.id;

  // Two advance jobs for the same enrolment, at once. This is exactly what
  // BullMQ's at-least-once delivery does when a worker dies mid-job.
  await Promise.all([
    queues.enqueueAdvance(id, { delay: 0 }),
    queues.enqueueAdvance(id, { delay: 0 }),
  ]);

  await until(async () => {
    const row = await WorkflowEnrollment.findByPk(id);
    return row.currentNodeId === "b" ? row : null;
  }, { timeoutMs: 60_000, what: "the send step to complete" });

  // Settle, so a second delivery arriving late is still counted.
  await sleep(8_000);

  const runs = await runsFor(id);
  const sends = runs.filter(
    (r) => r.nodeType === "sendEmail" && r.status === "completed",
  );

  check("exactly one send completed", sends.length === 1,
    `${sends.length} completed sendEmail runs`);
  check("it has a provider message id", Boolean(sends[0]?.providerMessageId),
    sends[0]?.providerMessageId ?? "none");
});

/* ── cleanup ─────────────────────────────────────────────────────────────── */

log("\n── cleanup ──");

for (const id of created) {
  const rows = await WorkflowEnrollment.findAll({ where: { workflowId: id }, attributes: ["id"] });
  const ids = rows.map((r) => r.id);

  if (ids.length) {
    await WorkflowNodeRun.destroy({ where: { enrollmentId: ids } });
    await WorkflowEnrollment.destroy({ where: { id: ids } });
  }

  await WorkflowVersion.destroy({ where: { workflowId: id } });
  await Workflow.destroy({ where: { id } });
}

const removedEvents = await LeadEvent.destroy({
  where: { sourceId: `verify-${STAMP}` },
});

log(`   removed ${created.length} workflows, their enrolments and runs, ${removedEvents} lead events`);

/* ── verdict ─────────────────────────────────────────────────────────────── */

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
const passed = results.filter((r) => r.ok === true);

log(`\n${"═".repeat(60)}`);
log(`  ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);

for (const f of failed) log(`  FAILED  ${f.test} → ${f.label}${f.detail ? `  (${f.detail})` : ""}`);
for (const s of skipped) log(`  SKIPPED ${s.test} → ${s.detail}`);

log(`${"═".repeat(60)}`);

await queues.closeQueues?.();
await db.sequelize.close();

process.exit(failed.length ? 1 : 0);
