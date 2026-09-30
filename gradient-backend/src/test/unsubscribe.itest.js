/**
 * Unsubscribe, against the live engine.
 *
 * The §8.2 behaviour, which had been designed and written about but never run:
 * what happens to somebody who is *already* unsubscribed when a workflow tries
 * to enrol them, and what happens to somebody who unsubscribes **half way
 * through a journey** with three more emails scheduled behind them.
 *
 * Needs Postgres and Redis. Does not need the worker, and sends no email — the
 * whole point is that nothing is sent.
 *
 * Every address used here is `@example.invalid`, which cannot receive mail.
 */

import "dotenv/config";

import db from "../database/postgres/models/index.js";
import { publishWorkflow } from "../services/workflow/publish.service.js";
import {
  enrolPerson,
  cancelEnrollmentsForEmail,
  SKIP_REASON,
} from "../services/workflow/enrollment.service.js";
import { suppress } from "../services/subscriber/suppression.service.js";
import { dispatchWorkflowEmail } from "../services/workflow/dispatch/emailDispatcher.js";
import * as queues from "../queues/workflowQueues.js";
import { QUEUE_NAMES } from "../queues/workflowQueues.js";
import { WORKFLOW_END_REASON } from "../config/constants/workflow.js";
import { EMAIL_PROVIDER_ID } from "../services/email/config/constants.js";

const { Workflow, WorkflowEnrollment, WorkflowVersion, Subscriber } = db;

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, { timeoutMs = 30_000, everyMs = 500, what = "" } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(everyMs);
  }
};

const STAMP = Date.now().toString(36);
const created = [];
const addresses = [];

const addr = (label) => {
  const email = `wf-unsub+${STAMP}-${label}@example.invalid`;
  addresses.push(email);
  return email;
};

const node = (id, type, config) => ({ id, type, config, position: { x: 0, y: 0 } });

/** A three-email journey: send, wait, send, wait, send. Nothing must arrive. */
const makeWorkflow = async (name) => {
  const workflow = await Workflow.create({
    name: `unsub-verify ${STAMP} ${name}`,
    status: "draft",
    triggerType: "staticList",
    // A real audience is never resolved: every enrolment below is explicit.
    triggerConfig: {
      recipientFilters: { include: [{ type: "leads", filters: {} }], exclude: [] },
    },
    definition: {
      entryNodeId: "w1",
      nodes: [
        // A wait first, so the journey parks before anything is sent and the
        // test never depends on a send having been attempted.
        node("w1", "wait", { value: 6, unit: "hours" }),
        node("s1", "sendEmail", {
          subject: `[UNSUB-VERIFY ${STAMP}] must never arrive`,
          body: "<p>If this arrived, unsubscribe did not stop the journey.</p>",
          senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
          senderName: "Unsubscribe Verification",
        }),
        node("w2", "wait", { value: 6, unit: "hours" }),
        node("s2", "sendEmail", {
          subject: `[UNSUB-VERIFY ${STAMP}] must never arrive either`,
          body: "<p>Second one.</p>",
          senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
          senderName: "Unsubscribe Verification",
        }),
        node("x", "exit", { reason: "completed" }),
      ],
      edges: [
        { from: "w1", to: "s1" },
        { from: "s1", to: "w2" },
        { from: "w2", to: "s2" },
        { from: "s2", to: "x" },
      ],
    },
    settings: {},
  });

  created.push(workflow.id);

  const result = await publishWorkflow(workflow);
  if (!result.published) throw new Error(`publish failed: ${result.errors?.join("; ")}`);

  return workflow.reload();
};

console.log("\n════ unsubscribe ════");

/* ══ 1. already unsubscribed before the workflow ever sees them ══════════ */

console.log("\n── someone who unsubscribed before we tried to enrol them ──");
{
  const workflow = await makeWorkflow("already");
  const email = addr("already");

  await suppress({ email, reason: "verification" });

  const outcome = await enrolPerson({ workflow, email });

  check("never enrolled at all", !outcome.enrolled, `reason=${outcome.reason}`);
  check("and the reason says why", outcome.reason === SKIP_REASON.SUPPRESSED, outcome.reason);

  const rows = await WorkflowEnrollment.count({ where: { email } });
  check("no enrolment row was written", rows === 0, `${rows} rows`);
}

/* ══ 2. unsubscribing half way through ═══════════════════════════════════ */

console.log("\n── someone who unsubscribes half way through ──");
{
  const a = await makeWorkflow("mid-a");
  const b = await makeWorkflow("mid-b");
  const email = addr("mid");

  /**
   * The cap is one live workflow per person, which is the correct default and
   * exactly what refused this on the first run. Overridden per call rather than
   * changed globally — the point here is what unsubscribe does to *several*
   * journeys at once, and a shared setting should not be edited to prove it.
   */
  const noCap = { maxActiveWorkflowsPerPerson: 5 };

  const first = await enrolPerson({ workflow: a, email, settings: noCap });
  check("enrolled in the first workflow", first.enrolled, first.reason ?? "");

  const second = await enrolPerson({ workflow: b, email, settings: noCap });
  check("enrolled in a second workflow too", second.enrolled, second.reason ?? "");

  // Let the wait park, so there is a real delayed job to be cancelled.
  const parked = await until(async () => {
    const row = await WorkflowEnrollment.findByPk(first.enrollment.id);
    return row.context?.wait?.nodeId === "w1" ? row : null;
  }, { what: "the first journey to park on its wait" });

  check("there is a scheduled job behind them", Boolean(parked.jobId), parked.jobId ?? "none");

  const queue = queues.getQueue(QUEUE_NAMES.ADVANCE);
  const jobBefore = await queue.getJob(parked.jobId);
  check("and it is really in Redis", Boolean(jobBefore), await jobBefore?.getState());

  /* they click unsubscribe */
  await suppress({ email, reason: "verification" });

  const ended = await until(async () => {
    const rows = await WorkflowEnrollment.findAll({ where: { email } });
    return rows.every((r) => r.status === "cancelled") ? rows : null;
  }, { what: "both journeys to end" });

  check("every journey ended, not just the one they clicked from", ended.length === 2,
    `${ended.length} enrolments`);
  check("each is cancelled", ended.every((r) => r.status === "cancelled"),
    ended.map((r) => r.status).join(", "));
  check("the reason is recorded as opted out",
    ended.every((r) => r.endReason === WORKFLOW_END_REASON.OPTED_OUT),
    ended.map((r) => r.endReason).join(", "));
  check("nothing is due any more", ended.every((r) => r.nextRunAt === null),
    ended.map((r) => String(r.nextRunAt)).join(", "));
  check("the job id is cleared, so reconcile cannot resurrect them",
    ended.every((r) => r.jobId === null),
    ended.map((r) => String(r.jobId)).join(", "));

  /**
   * Not "the job is gone" — "the job will never run again".
   *
   * `removeAdvanceJob` deliberately refuses to remove a job that is *running*,
   * because tearing one out mid-step leaves the enrolment with nothing to
   * finish it. Such a job runs to completion and lands in the `completed` set,
   * where `removeOnComplete` keeps it for a day. That is the correct outcome
   * and it is not the same as being scheduled.
   */
  const jobAfter = await queue.getJob(parked.jobId);
  const stateAfter = jobAfter ? await jobAfter.getState() : "removed";

  check("nothing is scheduled to run for them any more",
    !["waiting", "delayed", "active", "prioritized", "paused"].includes(stateAfter),
    `job is ${stateAfter}`);

  /* ── and if a job slips through anyway ── */
  await queues.enqueueAdvance(first.enrollment.id, { delay: 0 });
  await sleep(4_000);

  const after = await WorkflowEnrollment.findByPk(first.enrollment.id);
  check("a stray job cannot restart a cancelled journey",
    after.status === "cancelled" && after.nextRunAt === null,
    `status=${after.status} nextRunAt=${after.nextRunAt}`);

  /* ── and the dispatcher refuses even if asked directly ── */
  const dispatched = await dispatchWorkflowEmail({
    to: email,
    name: null,
    config: {
      subject: `[UNSUB-VERIFY ${STAMP}] direct dispatch`,
      body: "<p>Should be suppressed.</p>",
      senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    },
    enrollment: after,
    workflow: a,
  });

  check("the dispatcher refuses to send to them at all",
    dispatched.outcome === "suppressed", `outcome=${dispatched.outcome}`);
}

/* ══ 3. cancelling at the worst possible moment ══════════════════════════ */

console.log("\n── unsubscribing while a step is actually running ──");
{
  const workflow = await makeWorkflow("race");

  /**
   * The interesting case is not "cancel a parked journey" — that is easy. It is
   * a cancel that lands **between the job claiming the enrolment and the job
   * writing its result**, which is where the row was being resurrected: the
   * walk to the next node writes `status: active`, and it used to write it
   * unconditionally.
   *
   * There is no hook to interleave on, so this enrols and cancels immediately,
   * repeatedly. The advance job starts within milliseconds of the enrolment, so
   * a handful of attempts reliably lands at least one cancel mid-step.
   */
  const ATTEMPTS = 8;
  const bad = [];

  for (let i = 0; i < ATTEMPTS; i += 1) {
    const email = addr(`race-${i}`);

    const outcome = await enrolPerson({ workflow, email, allowReEnrollment: true });
    if (!outcome.enrolled) continue;

    await cancelEnrollmentsForEmail(email);

    // Long enough for any in-flight job to finish writing whatever it was
    // going to write.
    await sleep(1_500);

    const row = await WorkflowEnrollment.findByPk(outcome.enrollment.id);

    if (
      row.status !== "cancelled" ||
      row.nextRunAt !== null ||
      row.jobId !== null
    ) {
      bad.push(
        `#${i} status=${row.status} nextRunAt=${row.nextRunAt} jobId=${row.jobId}`,
      );
    }
  }

  check(
    `a cancel mid-step leaves the row terminal (${ATTEMPTS} attempts)`,
    bad.length === 0,
    bad.length ? bad.join(" | ") : "every attempt fully terminal",
  );

  const revived = await WorkflowEnrollment.count({
    where: { workflowId: workflow.id, status: ["active", "waiting"] },
  });

  check("none of them came back to life", revived === 0, `${revived} live`);
}

/* ══ 4. unsubscribing twice, and unsubscribing a stranger ════════════════ */

console.log("\n── the awkward repeats ──");
{
  const email = addr("twice");
  const workflow = await makeWorkflow("twice");

  await enrolPerson({ workflow, email });

  const firstPass = await cancelEnrollmentsForEmail(email);
  check("the first unsubscribe ends the journey", firstPass === 1, `${firstPass} cancelled`);

  const secondPass = await cancelEnrollmentsForEmail(email);
  check("unsubscribing again is a no-op, not an error", secondPass === 0,
    `${secondPass} cancelled`);

  let threw = null;
  try {
    await suppress({ email, reason: "verification" });
    await suppress({ email, reason: "verification" });
  } catch (error) {
    threw = error;
  }
  check("suppressing twice does not throw", !threw, threw?.message ?? "idempotent");

  const rows = await Subscriber.count({ where: { email } });
  check("and leaves exactly one subscriber row", rows === 1, `${rows} rows`);

  const stranger = await cancelEnrollmentsForEmail(addr("stranger"));
  check("unsubscribing somebody with no journeys is fine", stranger === 0, `${stranger}`);

  /* ── and they cannot be re-enrolled afterwards ── */
  const retry = await enrolPerson({ workflow, email, allowReEnrollment: true });
  check("they cannot be enrolled again while suppressed",
    !retry.enrolled && retry.reason === SKIP_REASON.SUPPRESSED, `reason=${retry.reason}`);
}

/* ── cleanup ─────────────────────────────────────────────────────────────── */

console.log("\n── cleanup ──");

for (const id of created) {
  const rows = await WorkflowEnrollment.findAll({ where: { workflowId: id }, attributes: ["id"] });
  const ids = rows.map((r) => r.id);

  if (ids.length) {
    await db.WorkflowNodeRun.destroy({ where: { enrollmentId: ids } });
    await WorkflowEnrollment.destroy({ where: { id: ids } });
  }

  await WorkflowVersion.destroy({ where: { workflowId: id } });
  await Workflow.destroy({ where: { id } });
}

const removedSubs = await Subscriber.destroy({ where: { email: addresses } });
console.log(`   removed ${created.length} workflows and ${removedSubs} subscriber rows`);

const failed = results.filter((r) => !r.ok);

console.log("\n" + "═".repeat(60));
console.log(`  ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) failed.forEach((f) => console.log(`  FAILED  ${f.label}`));
console.log("═".repeat(60) + "\n");

await queues.closeQueues();
process.exit(failed.length ? 1 : 0);
