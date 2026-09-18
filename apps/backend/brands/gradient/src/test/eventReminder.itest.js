/**
 * Manual script — `node src/test/eventReminder.itest.js`
 *
 * Full behavioural sweep of the event reminder pipeline: scheduling,
 * rescheduling, cancelling, send-now, deletion, the send loop's targeting and
 * counting, and the stuck/retry paths. Runs against the configured database
 * and the real Agenda Postgres backend — the queue semantics are the whole
 * point, so they are exercised, not mocked.
 *
 * Creates its own event, guests and templates, and tears all of it down.
 *
 * **No email leaves the machine.** Every transporter's `sendMail` is replaced
 * with an in-memory recorder before a single job is defined, and that is
 * asserted rather than assumed. The recorder is also how the failure paths are
 * driven, which real providers could not do on demand.
 *
 * **It refuses to run if anything else is processing this queue.** Agenda hands
 * each job to exactly one worker, so a `npm run dev` server on the same
 * database will win some of them — and that process has *real* providers. The
 * pre-flight canary below detects a competing worker and aborts. Stop the dev
 * server before running this.
 *
 * Guest addresses are SES mailbox-simulator addresses rather than a dead
 * domain, so even a send that escapes the stub is absorbed by SES instead of
 * hard-bouncing against the account's reputation.
 */
import { QueryTypes } from "sequelize";

import sequelize from "../database/postgres/sequelize.js";
import db from "../database/postgres/models/index.js";
import agenda from "../config/agenda.js";
import {
  initEmailProviders,
  getTransporters,
} from "../services/email/emailManager.js";
import { EMAIL_PROVIDER_ID } from "../services/email/config/constants.js";
import {
  EVENT_REMINDER_STATUS,
  EVENT_REMINDER_TARGET_STATUS,
  EVENT_REMINDER_ATTENDEE_TYPE,
} from "../config/constants/eventReminder.js";
import {
  EVENT_GUEST_STATUS,
  EVENT_ATTENDEE_TYPE,
} from "../config/constants/eventGuest.js";
import {
  createReminder,
  updateReminder,
  removeReminder,
  cancelReminder,
  scheduleReminder,
  sendReminderNow,
} from "../controllers/event/eventReminder.controller.js";

const { Event, EventGuest, EventReminder } = db;

const JOB_NAME = "send-event-email-reminder";
const TAG = `reminder-itest-${Date.now()}`;

/** Stamped onto every job this process runs, so a job executed by somebody
 *  else's worker is detectable rather than silently skewing the results. */
const MY_WORKER = `reminder-itest-${process.pid}`;

let passed = 0;
let failed = 0;

const ok = (label, condition, detail = "") => {
  condition ? passed++ : failed++;
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

const eq = (label, actual, expected) =>
  ok(
    label,
    actual === expected,
    actual === expected ? "" : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`,
  );

const section = (title) => console.log(`\n${title}`);

/* ------------------------------------------------------------------ *
 * Mail recorder — replaces every transporter before any job is defined
 * ------------------------------------------------------------------ */

const mailbox = [];
let stubCalls = 0;
/** Predicate deciding which recipients "fail"; default: everything succeeds. */
let failRecipient = () => false;

const stubTransporters = () => {
  initEmailProviders();

  const providers = getTransporters();

  if (!providers.length) {
    throw new Error("no email providers configured — cannot verify the stub");
  }

  for (const provider of providers) {
    provider.transporter.sendMail = async (payload) => {
      stubCalls++;
      if (failRecipient(payload.to)) {
        throw new Error("stubbed provider failure");
      }
      mailbox.push({ ...payload, sender: provider.email });
      return { stubbed: true };
    };
  }

  return providers;
};

/* ------------------------------------------------------------------ *
 * Controller harness
 * ------------------------------------------------------------------ */

const call = async (handler, { params = {}, body = {}, query = {} } = {}) => {
  let settle;
  const done = new Promise((resolve) => (settle = resolve));

  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    settle();
    return res;
  };

  let thrown = null;

  handler({ params, body, query, admin: { id: null } }, res, (err) => {
    thrown = err;
    settle();
  });

  await done;

  return { status: res.statusCode, body: res.body, error: thrown };
};

/* ------------------------------------------------------------------ *
 * Queue helpers
 * ------------------------------------------------------------------ */

const jobsFor = (templateId) =>
  sequelize.query(
    `SELECT id, name, data, next_run_at FROM agenda_jobs
      WHERE name = :name AND data->>'templateId' = :templateId`,
    { replacements: { name: JOB_NAME, templateId }, type: QueryTypes.SELECT },
  );

/** Jobs the processor would actually pick up. Finished ones (next_run_at NULL)
 *  sit in the table forever and are harmless. */
const runnableReminderJobs = () =>
  sequelize.query(
    `SELECT id, data, next_run_at FROM agenda_jobs
      WHERE name = :name AND next_run_at IS NOT NULL AND disabled = FALSE`,
    { replacements: { name: JOB_NAME }, type: QueryTypes.SELECT },
  );

const failCountFor = async (templateId) => {
  const [row] = await sequelize.query(
    `SELECT COALESCE(fail_count, 0) AS fail_count FROM agenda_jobs
      WHERE name = :name AND data->>'templateId' = :templateId
      ORDER BY fail_count DESC NULLS LAST LIMIT 1`,
    { replacements: { name: JOB_NAME, templateId }, type: QueryTypes.SELECT },
  );
  return Number(row?.fail_count ?? 0);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Which worker last touched this template's job. */
const workerFor = async (templateId) => {
  const [row] = await sequelize.query(
    `SELECT last_modified_by FROM agenda_jobs
      WHERE name = :name AND data->>'templateId' = :templateId
      ORDER BY last_run_at DESC NULLS LAST LIMIT 1`,
    { replacements: { name: JOB_NAME, templateId }, type: QueryTypes.SELECT },
  );
  return row?.last_modified_by ?? null;
};

/**
 * Agenda gives each job to exactly one worker. If a `npm run dev` server is up
 * on this database it will win some of them — and it holds real providers, so
 * the run would both misreport and actually send mail. Queue a job for a
 * template that does not exist (the handler logs "not found" and returns
 * without sending) and see who claims it.
 */
const assertSoleWorker = async () => {
  const canaryId = `canary-${TAG}`;
  await agenda.now(JOB_NAME, { templateId: canaryId });

  const deadline = Date.now() + 30000;
  let worker = null;

  while (Date.now() < deadline) {
    worker = await workerFor(canaryId);
    if (worker) break;
    await sleep(400);
  }

  await agenda.cancel({ name: JOB_NAME, data: { templateId: canaryId } });

  if (!worker) {
    console.error(
      "\nREFUSING TO RUN: nothing picked up the canary job within 30s.\n" +
        "The Agenda processor is not consuming this queue.\n",
    );
    process.exit(2);
  }

  if (worker !== MY_WORKER) {
    console.error(
      `\nREFUSING TO RUN: another worker ("${worker}") is processing this queue.\n` +
        `That is almost certainly a running \`npm run dev\` server on the same\n` +
        `database — and it sends through REAL email providers. Stop it, then re-run.\n`,
    );
    process.exit(2);
  }

  console.log(`sole worker on this queue: ${worker}\n`);
};

/** Poll until the template reaches a settled status, or give up. */
const waitForStatus = async (templateId, statuses, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await EventReminder.findByPk(templateId);
    if (row && statuses.includes(row.status)) return row;
    await sleep(500);
  }
  return EventReminder.findByPk(templateId);
};

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

let event;
const templateIds = new Set();

const makeTemplate = async (overrides = {}) => {
  const template = await EventReminder.create({
    eventId: event.id,
    name: `${TAG} template`,
    subject: "Hi {{name}}, see you soon",
    body: "<p>Hello {{name}}, the session starts shortly.</p>",
    senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    targetStatus: EVENT_REMINDER_TARGET_STATUS.ALL,
    targetAttendeeType: EVENT_REMINDER_ATTENDEE_TYPE.ALL,
    ...overrides,
  });
  templateIds.add(template.id);
  return template;
};

const setUp = async () => {
  event = await Event.create({
    eventTitle: `${TAG} event`,
    eventSlug: TAG,
  });

  await EventGuest.bulkCreate([
    {
      eventId: event.id,
      name: "asha  MENON",
      email: "success+asha@simulator.amazonses.com",
      phone: "9000000001",
      attendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
      status: EVENT_GUEST_STATUS.APPROVED,
    },
    {
      eventId: event.id,
      name: "ravi kumar",
      email: "success+ravi@simulator.amazonses.com",
      phone: "9000000002",
      attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL,
      status: EVENT_GUEST_STATUS.APPROVED,
    },
    {
      eventId: event.id,
      name: "sana p",
      email: "success+sana@simulator.amazonses.com",
      phone: "9000000003",
      attendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
      status: EVENT_GUEST_STATUS.WAITLISTED,
    },
    {
      eventId: event.id,
      name: "declined person",
      email: "success+declined@simulator.amazonses.com",
      phone: "9000000004",
      attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL,
      status: EVENT_GUEST_STATUS.DECLINED,
    },
    // Same human, registered twice — must receive one copy, not two.
    {
      eventId: event.id,
      name: "asha menon",
      email: "SUCCESS+ASHA@simulator.amazonses.com",
      phone: "9000000005",
      attendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
      status: EVENT_GUEST_STATUS.APPROVED,
    },
    // No email at all — skipped, and not counted as a failure.
    {
      eventId: event.id,
      name: "no email",
      email: null,
      phone: "9000000006",
      attendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
      status: EVENT_GUEST_STATUS.APPROVED,
    },
  ]);
};

const tearDown = async () => {
  for (const id of templateIds) {
    await agenda.cancel({ name: JOB_NAME, data: { templateId: id } });
  }
  await EventReminder.destroy({ where: { eventId: event?.id ?? null } });
  await EventGuest.destroy({ where: { eventId: event?.id ?? null } });
  if (event) await Event.destroy({ where: { id: event.id } });
};

/* ------------------------------------------------------------------ *
 * Cases
 * ------------------------------------------------------------------ */

const ALL_EMAILS = [
  "success+asha@simulator.amazonses.com",
  "success+ravi@simulator.amazonses.com",
  "success+sana@simulator.amazonses.com",
  "success+declined@simulator.amazonses.com",
];

const recipients = () => mailbox.map((m) => m.to).sort();

const runScheduling = async () => {
  section("A. Scheduling");

  const a = await makeTemplate({ name: `${TAG} A` });
  const b = await makeTemplate({ name: `${TAG} B` });

  const future = new Date(Date.now() + 60 * 60 * 1000);
  const resA = await call(scheduleReminder, {
    params: { id: a.id },
    body: { scheduledAt: future.toISOString() },
  });

  eq("A1 schedule returns 200", resA.status, 200);

  const aJobs = await jobsFor(a.id);
  eq("A2 exactly one queued job for the template", aJobs.length, 1);
  eq(
    "A3 queued job fires at the requested time",
    new Date(aJobs[0]?.next_run_at).toISOString(),
    future.toISOString(),
  );

  await a.reload();
  eq("A4 status becomes scheduled", a.status, EVENT_REMINDER_STATUS.SCHEDULED);
  eq(
    "A5 scheduledAt persisted",
    new Date(a.scheduledAt).toISOString(),
    future.toISOString(),
  );

  // The regression that broke live: scheduling anything wiped every other
  // reminder's job, because the dotted cancel filter was silently dropped.
  const laterB = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await call(scheduleReminder, {
    params: { id: b.id },
    body: { scheduledAt: laterB.toISOString() },
  });

  eq("A6 scheduling B leaves A's job alone (REGRESSION)", (await jobsFor(a.id)).length, 1);
  eq("A7 B has its own job", (await jobsFor(b.id)).length, 1);

  section("A'. Rescheduling");

  const moved = new Date(Date.now() + 90 * 60 * 1000);
  await call(scheduleReminder, {
    params: { id: a.id },
    body: { scheduledAt: moved.toISOString() },
  });

  const reJobs = await jobsFor(a.id);
  eq("A8 reschedule does not duplicate the job", reJobs.length, 1);
  eq(
    "A9 reschedule moves the fire time",
    new Date(reJobs[0]?.next_run_at).toISOString(),
    moved.toISOString(),
  );
  eq("A10 rescheduling A leaves B alone (REGRESSION)", (await jobsFor(b.id)).length, 1);

  const bad = await call(scheduleReminder, {
    params: { id: a.id },
    body: { scheduledAt: "not-a-date" },
  });
  eq("A11 invalid date rejected", bad.status, 400);

  const missing = await call(scheduleReminder, { params: { id: a.id }, body: {} });
  eq("A12 missing scheduledAt rejected", missing.status, 400);

  const ghost = await call(scheduleReminder, {
    params: { id: "does-not-exist" },
    body: { scheduledAt: future.toISOString() },
  });
  eq("A13 unknown template 404s", ghost.status, 404);

  eq(
    "A14 a bad request did not disturb the queue",
    (await jobsFor(a.id)).length + (await jobsFor(b.id)).length,
    2,
  );

  return { a, b };
};

const runCancel = async (a, b) => {
  section("B. Cancelling");

  const res = await call(cancelReminder, { params: { id: a.id } });
  eq("B1 cancel returns 200", res.status, 200);
  eq("B2 A's job is gone", (await jobsFor(a.id)).length, 0);
  eq("B3 B's job survives (REGRESSION)", (await jobsFor(b.id)).length, 1);

  await a.reload();
  eq("B4 status back to pending", a.status, EVENT_REMINDER_STATUS.PENDING);
  eq("B5 scheduledAt cleared", a.scheduledAt, null);

  await a.update({ status: EVENT_REMINDER_STATUS.PROCESSING });
  const busy = await call(cancelReminder, { params: { id: a.id } });
  eq("B6 cannot cancel while sending", busy.status, 400);
  await a.update({ status: EVENT_REMINDER_STATUS.PENDING });
};

const runSendNow = async (a, b) => {
  section("C. Send now");

  const res = await call(sendReminderNow, { params: { id: a.id } });
  eq("C1 send-now returns 200", res.status, 200);
  eq("C2 B's scheduled job survives (REGRESSION)", (await jobsFor(b.id)).length, 1);

  // Let the processor pick it up and finish.
  const settled = await waitForStatus(a.id, [
    EVENT_REMINDER_STATUS.SENT,
    EVENT_REMINDER_STATUS.FAILED,
  ]);
  eq("C3 job actually ran end to end", settled.status, EVENT_REMINDER_STATUS.SENT);

  await a.update({ status: EVENT_REMINDER_STATUS.SENT });
  const already = await call(sendReminderNow, { params: { id: a.id } });
  eq("C4 refuses to resend a sent template", already.status, 400);

  await a.update({ status: EVENT_REMINDER_STATUS.PROCESSING });
  const busy = await call(sendReminderNow, { params: { id: a.id } });
  eq("C5 refuses while processing", busy.status, 400);
  await a.update({ status: EVENT_REMINDER_STATUS.PENDING });

  mailbox.length = 0;
};

const runDelete = async (b) => {
  section("D. Deleting");

  const doomed = await makeTemplate({ name: `${TAG} doomed` });
  await call(scheduleReminder, {
    params: { id: doomed.id },
    body: { scheduledAt: new Date(Date.now() + 3600_000).toISOString() },
  });
  eq("D1 doomed template has a job", (await jobsFor(doomed.id)).length, 1);

  const res = await call(removeReminder, { params: { id: doomed.id } });
  eq("D2 delete returns 200", res.status, 200);
  eq("D3 its queued job is removed", (await jobsFor(doomed.id)).length, 0);
  eq("D4 B's job survives (REGRESSION)", (await jobsFor(b.id)).length, 1);
  templateIds.delete(doomed.id);

  const busy = await makeTemplate({
    name: `${TAG} busy`,
    status: EVENT_REMINDER_STATUS.PROCESSING,
  });
  const blocked = await call(removeReminder, { params: { id: busy.id } });
  eq("D5 cannot delete while sending", blocked.status, 400);
  await busy.destroy();
  templateIds.delete(busy.id);
};

/**
 * Run the job handler in this process, exactly as Agenda invokes it
 * (`definition.fn(job)`), instead of going through the queue.
 *
 * The send loop's behaviour — targeting, dedupe, counting, status, the stale
 * lock, the retry — is all inside this function, and running it directly makes
 * those assertions deterministic. It also sidesteps the fact that a queued job
 * goes to whichever worker grabs it first: a `npm run dev` server on the same
 * database wins some of them, and its providers are real. Section C still
 * proves the queue actually executes the job end to end.
 */
const runJobDirectly = async (templateId, { failCount = 0 } = {}) => {
  const definition = agenda.definitions[JOB_NAME];

  if (!definition?.fn) throw new Error("job is not defined");

  const job = {
    attrs: { name: JOB_NAME, data: { templateId }, failCount },
    scheduledFor: null,
    saved: false,
    schedule(when) {
      this.scheduledFor = when;
      return this;
    },
    async save() {
      this.saved = true;
      return this;
    },
  };

  let threw = null;
  try {
    await definition.fn(job);
  } catch (err) {
    threw = err;
  }

  return { job, threw };
};

/** Clear the recorder, run the handler, and hand back the reloaded row. */
const fire = async (template) => {
  mailbox.length = 0;
  stubCalls = 0;

  const { job, threw } = await runJobDirectly(template.id);
  await template.reload();

  console.log(
    `    [${template.name.replace(TAG, "").trim()}] status=${template.status} ` +
      `sent=${template.totalSent} failed=${template.totalFailed} ` +
      `stubCalls=${stubCalls} mailbox=${mailbox.length}` +
      (threw ? ` threw=${threw.message}` : ""),
  );

  return { row: template, job, threw };
};

const runSending = async () => {
  section("E. The send loop");

  // E1 — everyone
  const all = await makeTemplate({ name: `${TAG} all` });
  let { row } = await fire(all);

  eq("E1 status sent", row.status, EVENT_REMINDER_STATUS.SENT);
  eq("E2 one mail per unique guest", mailbox.length, 4);
  ok(
    "E3 reached exactly the expected addresses",
    JSON.stringify(recipients()) === JSON.stringify([...ALL_EMAILS].sort()),
    recipients().join(", "),
  );
  eq(
    "E4 duplicate registration deduped (REGRESSION)",
    recipients().filter((r) => r.toLowerCase() === "success+asha@simulator.amazonses.com").length,
    1,
  );
  eq("E5 totalSent recorded", row.totalSent, 4);
  eq("E6 totalFailed recorded", row.totalFailed, 0);
  ok("E7 sentAt stamped", !!row.sentAt);

  const toAsha = mailbox.find((m) => m.to.toLowerCase().includes("asha"));
  eq("E8 subject personalised", toAsha?.subject, "Hi Asha Menon, see you soon");
  ok("E9 body personalised", !!toAsha?.html?.includes("Hello Asha Menon"));
  ok("E10 body wrapped in the branded layout", (toAsha?.html?.length ?? 0) > 200);
  eq("E11 sent from the template's sender", toAsha?.sender, EMAIL_PROVIDER_ID.GD_NORP_MAIL);
  ok("E12 guest with no email skipped silently", mailbox.every((m) => !!m.to));

  // E13 — status filter
  const approved = await makeTemplate({
    name: `${TAG} approved`,
    targetStatus: EVENT_GUEST_STATUS.APPROVED,
  });
  ({ row } = await fire(approved));
  eq("E13 status filter targets approved only", mailbox.length, 2);
  eq("E14 counts match the filtered set", row.totalSent, 2);

  // E15 — attendee type filter
  const students = await makeTemplate({
    name: `${TAG} students`,
    targetAttendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
  });
  ({ row } = await fire(students));
  eq("E15 attendee filter targets students only", mailbox.length, 2);

  // E16 — both filters
  const approvedStudents = await makeTemplate({
    name: `${TAG} approved students`,
    targetStatus: EVENT_GUEST_STATUS.APPROVED,
    targetAttendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
  });
  ({ row } = await fire(approvedStudents));
  eq("E16 combined filters", mailbox.length, 1);

  // E17 — the null-target regression: used to compile to `status IS NULL`,
  // match nobody, and mark the reminder failed.
  const untargeted = await makeTemplate({ name: `${TAG} null targets` });
  await untargeted.update({ targetStatus: null, targetAttendeeType: null });
  ({ row } = await fire(untargeted));
  eq("E17 null target means everyone (REGRESSION)", mailbox.length, 4);
  eq("E18 and the reminder is not marked failed (REGRESSION)", row.status, EVENT_REMINDER_STATUS.SENT);

  // E19 — every send fails. This used to report `sent`.
  const doomed = await makeTemplate({ name: `${TAG} all fail` });
  failRecipient = () => true;
  ({ row } = await fire(doomed));
  failRecipient = () => false;

  eq("E19 total failure reports failed (REGRESSION)", row.status, EVENT_REMINDER_STATUS.FAILED);
  eq("E20 totalSent zero", row.totalSent, 0);
  eq("E21 totalFailed counts every attempt", row.totalFailed, 4);
  eq("E22 nothing was delivered", mailbox.length, 0);
  eq("E23 but every recipient was attempted", stubCalls, 4);

  // E24 — partial failure
  const partial = await makeTemplate({ name: `${TAG} partial` });
  failRecipient = (to) => to.toLowerCase().includes("ravi");
  ({ row } = await fire(partial));
  failRecipient = () => false;

  eq("E24 partial failure still counts as sent", row.status, EVENT_REMINDER_STATUS.SENT);
  eq("E25 totalSent excludes the failure", row.totalSent, 3);
  eq("E26 totalFailed counts it", row.totalFailed, 1);
  eq("E27 the survivors were delivered", mailbox.length, 3);

  // E28 — no matching guests
  const nobody = await makeTemplate({
    name: `${TAG} nobody`,
    targetStatus: EVENT_GUEST_STATUS.DECLINED,
    targetAttendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
  });
  ({ row } = await fire(nobody));
  eq("E28 empty audience marked failed", row.status, EVENT_REMINDER_STATUS.FAILED);
  eq("E29 nothing sent", mailbox.length, 0);

  // E30 — a template that vanished between queueing and running
  const orphan = await runJobDirectly("no-such-template-id");
  eq("E30 missing template is a no-op", orphan.threw, null);
};

const runGuards = async () => {
  section("F. Concurrency and stuck state");

  // F1 — an already-sent template must not fire again.
  const sent = await makeTemplate({ name: `${TAG} already sent` });
  await sent.update({ status: EVENT_REMINDER_STATUS.SENT });
  const sentRun = await fire(sent);
  eq("F1 sent template does not resend", mailbox.length, 0);
  eq("F2 and its status is untouched", sentRun.row.status, EVENT_REMINDER_STATUS.SENT);

  // F3 — a genuinely in-flight run must not be double-sent.
  const busy = await makeTemplate({ name: `${TAG} in flight` });
  await busy.update({ status: EVENT_REMINDER_STATUS.PROCESSING });
  const busyRun = await fire(busy);
  eq("F3 in-flight template is not double sent", mailbox.length, 0);
  eq("F4 and it is left alone", busyRun.row.status, EVENT_REMINDER_STATUS.PROCESSING);

  // F5 — a run abandoned by a restart. Backdate updatedAt past the lock
  // lifetime; the old code left these stuck on `processing` for good.
  const stale = await makeTemplate({ name: `${TAG} stale` });
  await stale.update({ status: EVENT_REMINDER_STATUS.PROCESSING });
  await sequelize.query(
    `UPDATE "EventReminders" SET "updatedAt" = NOW() - INTERVAL '3 hours' WHERE id = :id`,
    { replacements: { id: stale.id } },
  );

  const staleRun = await fire(stale);
  eq("F5 stale processing run is reclaimed (REGRESSION)", staleRun.row.status, EVENT_REMINDER_STATUS.SENT);
  eq("F6 and it actually sends", mailbox.length, 4);

  // F7 — the boundary: recently marked processing is still considered live.
  const recent = await makeTemplate({ name: `${TAG} recent processing` });
  await recent.update({ status: EVENT_REMINDER_STATUS.PROCESSING });
  await sequelize.query(
    `UPDATE "EventReminders" SET "updatedAt" = NOW() - INTERVAL '5 minutes' WHERE id = :id`,
    { replacements: { id: recent.id } },
  );
  const recentRun = await fire(recent);
  eq("F7 a 5-minute-old run is still treated as live", recentRun.row.status, EVENT_REMINDER_STATUS.PROCESSING);
  eq("F8 and nothing is sent", mailbox.length, 0);
};

const runRetry = async () => {
  section("G. Failure and retry");

  const template = await makeTemplate({ name: `${TAG} throws` });

  // Force the handler's catch block by breaking the guest lookup.
  const realFindAll = EventGuest.findAll.bind(EventGuest);
  EventGuest.findAll = async () => {
    throw new Error("simulated database failure");
  };

  // First failure — retries remain.
  mailbox.length = 0;
  const first = await runJobDirectly(template.id, { failCount: 0 });
  await template.reload();

  ok("G1 the handler rethrows so Agenda records the failure", !!first.threw, first.threw?.message);
  ok(
    "G2 processing lock released after a failure (REGRESSION)",
    template.status !== EVENT_REMINDER_STATUS.PROCESSING,
    template.status,
  );
  eq("G3 status returns to pending so the retry can run", template.status, EVENT_REMINDER_STATUS.PENDING);
  eq("G4 a retry is scheduled", first.job.scheduledFor, "in 30 seconds");
  ok("G5 and persisted", first.job.saved);
  eq("G6 nothing was sent", mailbox.length, 0);

  // Last attempt — retries exhausted.
  const last = await runJobDirectly(template.id, { failCount: 3 });
  await template.reload();

  ok("G7 the final attempt still rethrows", !!last.threw);
  eq("G8 exhausted retries mark the template failed", template.status, EVENT_REMINDER_STATUS.FAILED);
  eq("G9 and no further retry is scheduled", last.job.scheduledFor, null);

  // Recovery — the underlying fault clears and the retry succeeds.
  EventGuest.findAll = realFindAll;

  const recovered = await fire(template);
  eq("G10 the retry runs and succeeds", recovered.row.status, EVENT_REMINDER_STATUS.SENT);
  eq("G11 the retry delivered the mail", mailbox.length, 4);
};

const runControllerRules = async () => {
  section("H. Controller input rules");

  const created = await call(createReminder, {
    body: {
      eventId: event.id,
      name: `${TAG} blank targets`,
      subject: "s",
      body: "b",
      senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
      targetStatus: "",
      targetAttendeeType: "",
    },
  });

  eq("H1 create with blank targets succeeds", created.status, 201);
  const blank = await EventReminder.findByPk(created.body?.data?.id);
  if (blank) templateIds.add(blank.id);
  eq("H2 blank status normalised to all", blank?.targetStatus, EVENT_REMINDER_TARGET_STATUS.ALL);
  eq("H3 blank attendee type normalised to all", blank?.targetAttendeeType, EVENT_REMINDER_ATTENDEE_TYPE.ALL);

  const badSender = await call(createReminder, {
    body: {
      eventId: event.id,
      name: "x",
      subject: "s",
      body: "b",
      senderEmail: "someone@random.com",
    },
  });
  eq("H4 unknown sender rejected", badSender.status, 400);

  // A stray `status` in the body must not be able to mark a reminder sent.
  const tampered = await call(updateReminder, {
    params: { id: blank.id },
    body: { name: "renamed", status: EVENT_REMINDER_STATUS.SENT, totalSent: 999 },
  });
  eq("H5 update returns 200", tampered.status, 200);
  await blank.reload();
  eq("H6 name applied", blank.name, "renamed");
  eq("H7 status not writable from the body", blank.status, EVENT_REMINDER_STATUS.PENDING);
  eq("H8 counts not writable from the body", blank.totalSent, 0);

  await blank.update({ status: EVENT_REMINDER_STATUS.PROCESSING });
  const busy = await call(updateReminder, {
    params: { id: blank.id },
    body: { name: "nope" },
  });
  eq("H9 cannot edit while sending", busy.status, 400);
  await blank.update({ status: EVENT_REMINDER_STATUS.PENDING });
};

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

const main = async () => {
  await sequelize.authenticate();
  console.log(`connected to '${sequelize.config.database}'`);

  // Nothing is defined yet, so the processor cannot pick anything up. Check
  // the queue is clear of foreign reminder jobs before that changes.
  const foreign = await runnableReminderJobs();
  if (foreign.length) {
    console.error(
      `\nREFUSING TO RUN: ${foreign.length} reminder job(s) already queued in this database.\n` +
        `Starting the processor would fire them. Clear the queue or point at an\n` +
        `isolated database, then re-run.\n`,
    );
    process.exit(2);
  }
  console.log("queue is clear of foreign reminder jobs\n");

  const providers = stubTransporters();
  const allStubbed = providers.every(
    (p) => p.transporter.sendMail.toString().includes("failRecipient"),
  );
  ok("S1 every transporter is stubbed before any job is defined", allStubbed);
  if (!allStubbed) {
    console.error("aborting — a real provider could send mail");
    process.exit(2);
  }

  const { default: eventReminderJob } = await import("../jobs/eventReminderJob.js");
  eventReminderJob();
  agenda.attrs.name = MY_WORKER;
  await agenda.start();
  console.log(`agenda processor started as ${MY_WORKER}`);

  await assertSoleWorker();

  try {
    await setUp();

    const { a, b } = await runScheduling();
    await runCancel(a, b);
    await runSendNow(a, b);
    await runDelete(b);
    await runSending();
    await runGuards();
    await runRetry();
    await runControllerRules();
  } finally {
    await tearDown();
    await agenda.stop();
    await sequelize.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
};

main().catch(async (err) => {
  console.error("\nsuite crashed:", err);
  try {
    await tearDown();
    await agenda.stop();
    await sequelize.close();
  } catch {}
  process.exit(1);
});
