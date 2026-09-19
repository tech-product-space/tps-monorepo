/**
 * The static-list trigger — pressing Run, end to end.
 *
 * The other half of `realtimeTrigger.itest.js`. Where that one proves people
 * arrive on their own, this one proves the deliberate act works: an admin picks
 * an audience, publishes, presses Run, and a few hundred people start a
 * journey.
 *
 * Nothing here reaches into the engine. Each check goes in at the **controller**
 * — the same `runWorkflow`, `previewAudience` and `getRunStatus` the panel
 * calls — and then waits for the queue, the worker, `buildRecipients` and
 * `enrolPerson` to do the rest. The gates are checked by asking for something
 * that should be refused and reading the refusal, not by calling the function
 * that implements the gate.
 *
 * HTTP and admin auth are the only layers left out: the controllers are driven
 * with a fake `req`/`res` pair, so no token is needed and each assertion sits
 * next to the row it is about.
 *
 * Needs Postgres, Redis and the worker (`npm run worker`).
 *
 * Sends no email — every fixture workflow parks on a 12-hour wait before its
 * send step. Every address is `@example.invalid`, which cannot receive mail.
 */

import "dotenv/config";

import { Op } from "sequelize";

import db from "../database/postgres/models/index.js";
import { publishWorkflow } from "../services/workflow/publish.service.js";
import { enrolPerson } from "../services/workflow/enrollment.service.js";
import { getWorkflowSettings } from "../services/workflow/settings.service.js";
import { suppress } from "../services/subscriber/suppression.service.js";
import * as queues from "../queues/workflowQueues.js";
import { QUEUE_NAMES } from "../queues/workflowQueues.js";
import {
  runWorkflow,
  getRunStatus,
  previewAudience,
} from "../controllers/workflow/run.controller.js";
import {
  WORKFLOW_ENROLLMENT_SOURCE,
  WORKFLOW_ENROLLMENT_STATUS,
  WORKFLOW_END_REASON,
} from "../config/constants/workflow.js";
import { EMAIL_PROVIDER_ID } from "../services/email/config/constants.js";

const {
  Workflow,
  WorkflowEnrollment,
  WorkflowNodeRun,
  WorkflowVersion,
  Lead,
  LeadEvent,
  Subscriber,
} = db;

/* ── harness ─────────────────────────────────────────────────────────────── */

const results = [];
let section = "";

const check = (label, ok, detail = "") => {
  results.push({ section, label, ok });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const skip = (label, why) => {
  results.push({ section, label, ok: null });
  console.log(`   SKIP  ${label}  — ${why}`);
};

const heading = (title) => {
  section = title;
  console.log(`\n── ${title} ──`);
};

/**
 * Runs one block of checks, reporting a fixture that will not build rather than
 * crashing the run.
 *
 * Same reason as the realtime suite: a throw out of the script skips the
 * cleanup at the bottom and leaves rows behind in a shared database.
 */
const attempt = async (label, fn) => {
  try {
    await fn();
  } catch (error) {
    check(label, false, `fixture failed: ${error.message.split("\n")[0]}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls a controller the way Express would, and waits for its reply.
 *
 * `asyncWrapper` does **not** return the handler's promise — it swallows it
 * into a `.catch(next)` — so awaiting the call itself would read the response
 * before the handler had written one. The promise resolves from inside `json`
 * instead, which is the only point at which there is genuinely an answer.
 */
const call = (handler, { params = {}, body = {} } = {}) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload });
        return this;
      },
    };

    const req = {
      params,
      body,
      query: {},
      admin: { id: null },
      activity: { set: () => {} },
    };

    handler(req, res, (error) =>
      reject(error ?? new Error("next() was called with no error")),
    );
  });

const STAMP = Date.now().toString(36);
const createdWorkflows = [];
const createdEmails = [];

const addr = (label) => {
  const email = `sl-trig+${STAMP}-${label}@example.invalid`;
  createdEmails.push(email);
  return email;
};

const node = (id, type, config) => ({ id, type, config, position: { x: 0, y: 0 } });

/** A lead this run owns, tagged with a source no other row in the table has. */
const lead = (source, email, name, extra = {}) =>
  Lead.create({ name, email, source, ...extra });

/**
 * A static-list workflow that enrols and then parks, forever, before its send.
 *
 * Publish requires a reachable send step; parking in front of it means the test
 * can prove a Run enrolled the right people without proving anything about
 * anybody's inbox.
 */
const makeWorkflow = async (name, recipientFilters, triggerExtra = {}) => {
  const workflow = await Workflow.create({
    name: `[SL-TRIG ${STAMP}] ${name}`,
    triggerType: "staticList",
    triggerConfig: { recipientFilters, ...triggerExtra },
    definition: {
      entryNodeId: "w",
      nodes: [
        node("w", "wait", { value: 12, unit: "hours" }),
        node("s", "sendEmail", {
          subject: `[SL-TRIG ${STAMP}] never sent`,
          body: "<p>Unreachable within this test.</p>",
          senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
        }),
        node("x", "exit", { reason: "completed" }),
      ],
      edges: [
        { from: "w", to: "s" },
        { from: "s", to: "x" },
      ],
    },
  });

  createdWorkflows.push(workflow.id);

  const published = await publishWorkflow(workflow);

  if (!published.published) {
    throw new Error(`publish refused: ${published.errors?.join("; ")}`);
  }

  return workflow.reload();
};

/** Include everybody whose lead came from this run's own source tag. */
const fromSource = (source) => ({
  include: [{ type: "leads", filters: { source: [source] } }],
});

const run = (workflow) => call(runWorkflow, { params: { id: workflow.id } });

/** Waits for a Run to have enrolled `expected` people, then stops watching. */
const waitForEnrolments = async (workflowId, expected, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const rows = await WorkflowEnrollment.findAll({ where: { workflowId } });

    if (rows.length >= expected) return rows;
    if (Date.now() > deadline) return rows;

    await sleep(750);
  }
};

/** Waits for the worker to have moved an enrolment off its entry node. */
const waitForParked = async (enrollmentId, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const row = await WorkflowEnrollment.findByPk(enrollmentId);

    if (row?.context?.wait?.nodeId) return row;
    if (Date.now() > deadline) return row;

    await sleep(750);
  }
};

console.log("\n════ the static list, end to end ════");

const settings = await getWorkflowSettings();

/* ══ 1. a Run enrols the audience it resolves ════════════════════════════ */

heading("pressing Run");

/** Shared by the later sections, so it is built outside `attempt`. */
const MAIN_SOURCE = `sl-main-${STAMP}`;
let mainWorkflow = null;

await attempt("a Run enrols the audience", async () => {
  const people = [
    { email: addr("a"), name: "Aisha Kapoor" },
    { email: addr("b"), name: "Bilal Nair" },
    { email: addr("c"), name: "Chandni Rao" },
  ];

  for (const p of people) await lead(MAIN_SOURCE, p.email, p.name);

  // A row with no address at all, in the same source. The resolver drops it
  // before dedupe; if it ever stopped doing so, `enrolPerson` would refuse it
  // with `noEmail` and the count below would still be three — which is why the
  // count is not the only thing asserted.
  await lead(MAIN_SOURCE, null, "No Address");

  mainWorkflow = await makeWorkflow("main", fromSource(MAIN_SOURCE));

  const reply = await run(mainWorkflow);

  check("Run is accepted", reply.status === 200 && Boolean(reply.body?.data?.runId),
    `${reply.status} ${reply.body?.message ?? ""}`);

  const rows = await waitForEnrolments(mainWorkflow.id, 3);

  check("everybody in the audience is enrolled", rows.length === 3,
    `${rows.length} enrolments`);

  check("and nobody who has no address",
    rows.every((r) => r.email), "an empty address got in");

  check("each one says the Run put them there",
    rows.length > 0 &&
      rows.every((r) => r.enrollmentSource === WORKFLOW_ENROLLMENT_SOURCE.STATIC_LIST),
    rows.map((r) => r.enrollmentSource).join(", "));

  check("each one records where they came from",
    rows.length > 0 && rows.every((r) => r.sourceType === "leads" && r.sourceId),
    rows.map((r) => r.sourceType).join(", "));

  check("each one carries the person's name",
    rows.length > 0 && rows.every((r) => Boolean(r.name)),
    rows.map((r) => r.name ?? "null").join(", "));

  // The journey they walk is the one that was published, not the draft as it
  // stands now — the same freeze the realtime path relies on.
  check("each one is pinned to the published version",
    rows.length > 0 && rows.every((r) => r.workflowVersion === mainWorkflow.currentVersion),
    rows.map((r) => r.workflowVersion).join(", "));

  const after = await Workflow.findByPk(mainWorkflow.id);

  check("the workflow records that it ran", Boolean(after.lastRunAt),
    after.lastRunAt ?? "never");
});

/* ══ 2. the journey actually starts ══════════════════════════════════════ */

heading("the journey actually starts");

await attempt("the journey starts", async () => {
  if (!mainWorkflow) {
    skip("the first step really ran", "the Run above did not enrol anybody");
    return;
  }

  const rows = await WorkflowEnrollment.findAll({
    where: { workflowId: mainWorkflow.id },
  });

  const parked = [];
  for (const row of rows) parked.push(await waitForParked(row.id));

  check("the worker picked every one of them up",
    parked.length > 0 && parked.every((r) => r.context?.wait?.nodeId === "w"),
    parked.map((r) => r.context?.wait?.nodeId ?? "never advanced").join(", "));

  const twelveHours = 12 * 60 * 60 * 1000;

  check("each is due when the wait says, not immediately",
    parked.length > 0 &&
      parked.every((r) => {
        const due = new Date(r.nextRunAt).getTime() - Date.now();
        return due > twelveHours * 0.9 && due < twelveHours * 1.1;
      }),
    parked
      .map((r) => `${Math.round((new Date(r.nextRunAt) - Date.now()) / 3600000)}h`)
      .join(", "));

  // The row says when, and the queue is what will actually wake it. A row with
  // a due time and no job is precisely what the reconcile cron exists to find,
  // so it must not be the normal state.
  const advance = queues.getQueue(QUEUE_NAMES.ADVANCE);
  const states = [];

  for (const row of parked) {
    if (!row.jobId) {
      states.push("no job id");
      continue;
    }
    const job = await advance.getJob(row.jobId);
    states.push(job ? await job.getState() : "gone");
  }

  check("and something is scheduled to wake each of them",
    states.length > 0 && states.every((s) => s === "delayed"),
    states.join(", "));

  const runs = await WorkflowNodeRun.count({
    where: { enrollmentId: rows.map((r) => r.id) },
  });

  check("the first step is recorded against each of them", runs >= rows.length,
    `${runs} step runs for ${rows.length} people`);
});

/* ══ 3. the audience decides who gets in ═════════════════════════════════ */

heading("the audience decides who gets in");

await attempt("exclusion", async () => {
  const source = `sl-excl-${STAMP}`;
  const dropped = `sl-excl-drop-${STAMP}`;

  const kept = [addr("keep-1"), addr("keep-2")];
  const removed = addr("removed");

  for (const email of kept) await lead(source, email, "Kept");

  // In the include source *and* in the exclusion. This is the ordinary shape
  // of a real segment — "everyone who downloaded the brochure except the people
  // who already enrolled" — and the person is in both lists, not just one.
  await lead(source, removed, "Removed");
  await lead(dropped, removed, "Removed");

  const workflow = await makeWorkflow("exclusion", {
    include: [{ type: "leads", filters: { source: [source] } }],
    exclude: [{ type: "leads", filters: { source: [dropped] } }],
  });

  await run(workflow);

  const rows = await waitForEnrolments(workflow.id, 2);
  const emails = rows.map((r) => r.email).sort();

  check("the exclusion takes people out", rows.length === 2, `${rows.length} enrolments`);
  check("and it takes out the right one", !emails.includes(removed),
    emails.join(", ") || "nobody");
});

await attempt("dedupe", async () => {
  const source = `sl-dupe-${STAMP}`;
  const email = addr("twice-in-list");

  // Somebody who filled the same form twice. Leads have no capture-time dedupe,
  // so this is two rows, and without the dedupe in `buildRecipients` it would
  // be two enrolment attempts for one person.
  await lead(source, email, "First Submission");
  await lead(source, email, "Second Submission");

  const workflow = await makeWorkflow("dedupe", fromSource(source));

  await run(workflow);
  await waitForEnrolments(workflow.id, 1);
  await sleep(6_000);

  const count = await WorkflowEnrollment.count({ where: { workflowId: workflow.id } });

  check("somebody in the list twice is enrolled once", count === 1, `${count} enrolments`);
});

await attempt("suppression", async () => {
  const source = `sl-supp-${STAMP}`;
  const optedOut = addr("opted-out");
  const fine = addr("still-in");

  await suppress({ email: optedOut, reason: "static list verification" });

  await lead(source, optedOut, "Opted Out");
  await lead(source, fine, "Still In");

  const workflow = await makeWorkflow("suppression", fromSource(source));

  await run(workflow);
  await waitForEnrolments(workflow.id, 1);
  await sleep(6_000);

  const rows = await WorkflowEnrollment.findAll({ where: { workflowId: workflow.id } });

  check("somebody who has unsubscribed is left out",
    rows.length === 1 && rows[0].email === fine,
    rows.map((r) => r.email).join(", ") || "nobody");
});

/* ══ 4. what stops a Run ═════════════════════════════════════════════════ */

heading("what stops a Run");

await attempt("the refusals", async () => {
  const draft = await Workflow.create({
    name: `[SL-TRIG ${STAMP}] never published`,
    triggerType: "staticList",
    triggerConfig: { recipientFilters: fromSource(MAIN_SOURCE) },
    definition: {
      entryNodeId: "w",
      nodes: [node("w", "wait", { value: 12, unit: "hours" })],
      edges: [],
    },
  });
  createdWorkflows.push(draft.id);

  const unpublished = await run(draft);

  check("an unpublished draft refuses to run",
    unpublished.status === 409 && /Publish this workflow/i.test(unpublished.body?.message ?? ""),
    `${unpublished.status} ${unpublished.body?.message ?? ""}`);

  if (mainWorkflow) {
    await mainWorkflow.update({ status: "paused" });

    const paused = await run(mainWorkflow);

    check("a paused workflow refuses to run", paused.status === 409,
      `${paused.status} ${paused.body?.message ?? ""}`);

    await mainWorkflow.update({ status: "active" });
  } else {
    skip("a paused workflow refuses to run", "no published workflow to pause");
  }

  const realtime = await Workflow.create({
    name: `[SL-TRIG ${STAMP}] live trigger`,
    triggerType: "newActivity",
    triggerConfig: { sources: [{ type: "leads", filters: { source: [MAIN_SOURCE] } }] },
    definition: {
      entryNodeId: "w",
      nodes: [
        node("w", "wait", { value: 12, unit: "hours" }),
        node("s", "sendEmail", {
          subject: "x",
          body: "<p>x</p>",
          senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
        }),
        node("x", "exit", { reason: "completed" }),
      ],
      edges: [
        { from: "w", to: "s" },
        { from: "s", to: "x" },
      ],
    },
  });
  createdWorkflows.push(realtime.id);
  await publishWorkflow(realtime);
  await realtime.update({ status: "paused" });

  const nothingToRun = await run(realtime);

  check("a live-trigger workflow has nothing to run",
    nothingToRun.status === 409,
    `${nothingToRun.status} ${nothingToRun.body?.message ?? ""}`);
});

await attempt("paused in the gap", async () => {
  const source = `sl-gap-${STAMP}`;
  await lead(source, addr("gap"), "Queued Then Paused");

  const workflow = await makeWorkflow("paused in the gap", fromSource(source));

  /**
   * Paused *after* the Run is queued and before the worker picks it up.
   *
   * The endpoint's status check cannot catch this — it already passed. The
   * second check, inside the job, is the only thing standing between a paused
   * workflow and a few thousand people being enrolled into it.
   */
  await workflow.update({ status: "paused" });

  await queues.enqueueBulkEnroll({ workflowId: workflow.id, runId: `gap-${STAMP}` });

  await sleep(12_000);

  const count = await WorkflowEnrollment.count({ where: { workflowId: workflow.id } });

  check("a workflow paused after Run was pressed enrols nobody", count === 0,
    `${count} enrolments`);
});

await attempt("the cap", async () => {
  const cap = settings.maxActiveWorkflowsPerPerson;
  const source = `sl-cap-${STAMP}`;
  const busy = addr("already-busy");

  await lead(source, busy, "Already Busy");

  // Filled to the cap with workflows this person is already live in, so the
  // one under test is the one over the line.
  for (let i = 0; i < cap; i += 1) {
    const filler = await makeWorkflow(`filler ${i}`, {
      include: [{ type: "leads", filters: { source: [`sl-nobody-${STAMP}`] } }],
    });

    const outcome = await enrolPerson({ workflow: filler, email: busy, name: "Already Busy" });

    if (!outcome.enrolled) throw new Error(`filler ${i} refused: ${outcome.reason}`);
  }

  const workflow = await makeWorkflow("over the cap", fromSource(source));

  await run(workflow);
  await sleep(12_000);

  const count = await WorkflowEnrollment.count({ where: { workflowId: workflow.id } });

  check(`somebody already in ${cap} workflow${cap === 1 ? "" : "s"} is not enrolled again`,
    count === 0, `${count} enrolments`);
});

/* ══ 5. running it twice ═════════════════════════════════════════════════ */

heading("running it twice");

await attempt("a second Run", async () => {
  if (!mainWorkflow) {
    skip("a second Run enrols nobody new", "the first Run did not happen");
    return;
  }

  const before = await WorkflowEnrollment.count({ where: { workflowId: mainWorkflow.id } });

  await run(mainWorkflow);
  await sleep(12_000);

  const after = await WorkflowEnrollment.count({ where: { workflowId: mainWorkflow.id } });

  check("a second Run does not enrol the same people again", after === before,
    `${before} → ${after}`);
});

await attempt("re-entry", async () => {
  const source = `sl-again-${STAMP}`;
  const email = addr("finished");

  await lead(source, email, "Finished Before");

  const workflow = await makeWorkflow("re-entry", fromSource(source));

  await run(workflow);
  const [first] = await waitForEnrolments(workflow.id, 1);

  if (!first) {
    check("somebody who finished it before is not enrolled again", false, "never enrolled");
    return;
  }

  // Finished, the way the exit step would leave them.
  await first.update({
    status: WORKFLOW_ENROLLMENT_STATUS.COMPLETED,
    endReason: WORKFLOW_END_REASON.COMPLETED,
    completedAt: new Date(),
    nextRunAt: null,
    jobId: null,
  });
  await queues.removeAdvanceJob(first.jobId);

  await run(workflow);
  await sleep(12_000);

  const afterSecond = await WorkflowEnrollment.count({ where: { workflowId: workflow.id } });

  check("somebody who finished it before is not enrolled again", afterSecond === 1,
    `${afterSecond} enrolments`);

  await workflow.update({
    triggerConfig: { ...workflow.triggerConfig, allowReEnrollment: true },
  });

  await run(workflow);
  await sleep(12_000);

  const afterThird = await WorkflowEnrollment.count({ where: { workflowId: workflow.id } });

  check("…unless the workflow is set to let people back in", afterThird === 2,
    `${afterThird} enrolments`);
});

/* ══ 6. the numbers the panel shows ══════════════════════════════════════ */

heading("the numbers the panel shows");

await attempt("preview", async () => {
  if (!mainWorkflow) {
    skip("the preview matches what a Run enrols", "no workflow to preview");
    return;
  }

  const reply = await call(previewAudience, { params: { id: mainWorkflow.id } });
  const enrolled = await WorkflowEnrollment.count({ where: { workflowId: mainWorkflow.id } });

  check("the preview matches what a Run enrols",
    reply.status === 200 && reply.body?.data?.total === enrolled,
    `preview ${reply.body?.data?.total}, enrolled ${enrolled}`);

  const emptyDraft = await Workflow.create({
    name: `[SL-TRIG ${STAMP}] no audience yet`,
    triggerType: "staticList",
    triggerConfig: { recipientFilters: { include: [], exclude: [] } },
    definition: { entryNodeId: "w", nodes: [node("w", "wait", { value: 1, unit: "hours" })], edges: [] },
  });
  createdWorkflows.push(emptyDraft.id);

  const empty = await call(previewAudience, { params: { id: emptyDraft.id } });

  // Previewing a half-built draft is how an admin checks a filter as they add
  // it. "Nobody yet" is the answer; refusing to answer is not.
  check("a draft with no audience previews as nobody, not as an error",
    empty.status === 200 && empty.body?.data?.total === 0,
    `${empty.status} ${JSON.stringify(empty.body?.data ?? empty.body?.message ?? "")}`);

  check("and it shows real addresses to check against",
    (reply.body?.data?.sample?.length ?? 0) > 0 &&
      reply.body.data.sample.every((s) => s.email),
    `${reply.body?.data?.sample?.length ?? 0} sampled`);
});

await attempt("run status", async () => {
  if (!mainWorkflow) {
    skip("run status", "no workflow to ask about");
    return;
  }

  const idle = await call(getRunStatus, { params: { id: mainWorkflow.id } });

  check("run status says nothing is running when nothing is",
    idle.status === 200 && idle.body?.data?.running === false,
    JSON.stringify(idle.body?.data ?? {}));

  /**
   * Queued but not yet picked up, held there deliberately.
   *
   * A real Run is usually over in under a second, so watching for "running" on
   * one is a race with the worker. A delayed job is the same state the panel
   * has to read — a job for this workflow that has not finished — without the
   * race.
   */
  const queue = queues.getQueue(QUEUE_NAMES.BULK_ENROLL);
  const held = await queue.add(
    "bulk-enroll",
    { workflowId: mainWorkflow.id, runId: `held-${STAMP}` },
    { jobId: `bulk:${mainWorkflow.id}:held-${STAMP}`, delay: 60_000 },
  );

  const busy = await call(getRunStatus, { params: { id: mainWorkflow.id } });

  check("and says a queued Run is running",
    busy.body?.data?.running === true && busy.body?.data?.pending === 1,
    JSON.stringify(busy.body?.data ?? {}));

  await held.remove();

  const again = await call(getRunStatus, { params: { id: mainWorkflow.id } });

  check("and stops saying so once it is gone", again.body?.data?.running === false,
    JSON.stringify(again.body?.data ?? {}));
});

/* ══ 7. an audience that cannot be resolved ══════════════════════════════ */

heading("an audience that cannot be resolved");

await attempt("broken audience", async () => {
  const broken = await Workflow.create({
    name: `[SL-TRIG ${STAMP}] broken exclusion`,
    triggerType: "staticList",
    triggerConfig: {
      recipientFilters: {
        include: [{ type: "leads", filters: { source: [MAIN_SOURCE] } }],
        // Nothing resolves this. Publishing must say so: an exclusion that
        // cannot run does not narrow the audience, it takes the whole Run down
        // — and it does it after the admin has been told the Run started.
        exclude: [{ type: "peopleWhoWavedAtUs", filters: {} }],
      },
    },
    definition: {
      entryNodeId: "w",
      nodes: [
        node("w", "wait", { value: 12, unit: "hours" }),
        node("s", "sendEmail", {
          subject: "x",
          body: "<p>x</p>",
          senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
        }),
        node("x", "exit", { reason: "completed" }),
      ],
      edges: [
        { from: "w", to: "s" },
        { from: "s", to: "x" },
      ],
    },
  });
  createdWorkflows.push(broken.id);

  const published = await publishWorkflow(broken);

  check("publishing refuses an exclusion nothing can resolve",
    published.published === false &&
      published.errors?.some((e) => /peopleWhoWavedAtUs/.test(e)),
    published.published ? "published it anyway" : (published.errors ?? []).join("; "));

  let previewError = null;
  let preview = null;

  try {
    preview = await call(previewAudience, { params: { id: broken.id } });
  } catch (error) {
    previewError = error;
  }

  check("and the preview names the source rather than failing",
    preview?.status === 409 && /peopleWhoWavedAtUs/.test(preview.body?.message ?? ""),
    previewError ? `threw: ${previewError.message}` : `${preview?.status} ${preview?.body?.message ?? ""}`,
  );

  /**
   * The one already published, before publishing checked for this.
   *
   * The lock on `triggerConfig` means no admin can create this state today, so
   * the row is edited directly — which is exactly what a workflow published
   * before the check looks like now. Run has to be the one to catch it.
   */
  const grandfathered = await makeWorkflow("published before the check",
    fromSource(MAIN_SOURCE));

  await grandfathered.update({
    triggerConfig: {
      recipientFilters: {
        include: [{ type: "leads", filters: { source: [MAIN_SOURCE] } }],
        exclude: [{ type: "peopleWhoWavedAtUs", filters: {} }],
      },
    },
  });

  const reply = await run(grandfathered);

  check("Run refuses one that was published before the check",
    reply.status === 409 && /peopleWhoWavedAtUs/.test(reply.body?.message ?? ""),
    `${reply.status} ${reply.body?.message ?? ""}`);

  await sleep(6_000);

  const enrolled = await WorkflowEnrollment.count({
    where: { workflowId: grandfathered.id },
  });

  check("and nothing was queued behind that refusal", enrolled === 0,
    `${enrolled} enrolments`);
});

/* ── cleanup ─────────────────────────────────────────────────────────────── */

heading("cleanup");

for (const id of createdWorkflows) {
  const rows = await WorkflowEnrollment.findAll({
    where: { workflowId: id },
    attributes: ["id", "jobId"],
  });

  for (const row of rows) await queues.removeAdvanceJob(row.jobId);

  const ids = rows.map((r) => r.id);

  if (ids.length) {
    await WorkflowNodeRun.destroy({ where: { enrollmentId: ids } });
    await WorkflowEnrollment.destroy({ where: { id: ids } });
  }

  await WorkflowVersion.destroy({ where: { workflowId: id } });
  await Workflow.destroy({ where: { id } });
}

const leadIds = (
  await Lead.findAll({
    where: { source: { [Op.like]: `sl-%${STAMP}` } },
    attributes: ["id"],
  })
).map((r) => r.id);

const removedEvents = leadIds.length
  ? await LeadEvent.destroy({ where: { sourceId: leadIds } })
  : 0;

await LeadEvent.destroy({ where: { email: createdEmails } });
await Lead.destroy({ where: { source: { [Op.like]: `sl-%${STAMP}` } } });
await Subscriber.destroy({ where: { email: createdEmails } });

console.log(
  `   removed ${createdWorkflows.length} workflows, ${leadIds.length} leads ` +
    `and ${removedEvents} lead events`,
);

/* ── the tally ───────────────────────────────────────────────────────────── */

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
const passed = results.filter((r) => r.ok === true);

console.log("\n" + "═".repeat(60));
console.log(`  ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
failed.forEach((f) => console.log(`  FAILED   ${f.section} → ${f.label}`));
skipped.forEach((s) => console.log(`  SKIPPED  ${s.section} → ${s.label}`));
console.log("═".repeat(60) + "\n");

await queues.closeQueues();
process.exit(failed.length ? 1 : 0);
