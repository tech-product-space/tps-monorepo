/**
 * Facebook lead ads as a realtime workflow trigger.
 *
 * Two things are worth proving and neither is obvious:
 *
 * 1. **A new form submission starts the journey**, narrowed by *form* — which is
 *    the only handle on a Meta lead that stays meaningful. Ads are swapped
 *    weekly and campaigns renamed mid-flight; the form is what determines what
 *    the person was actually asked.
 *
 * 2. **History does not.** A `meta_leads` row is not like every other trigger
 *    source: the others are created once, live, by the person themselves, but
 *    this table also fills from a backfill of years of past leads. Without a
 *    guard, mapping an old form would mail everybody who ever filled it.
 *
 * Needs Postgres and Redis, and the worker running for the end-to-end check.
 * Sends no email — the fixture workflow parks on a wait before its send step.
 *
 * Every fixture is removed at the end, including the `lead_events` rows the
 * Meta lead's own emitter writes.
 */

import "dotenv/config";

import db from "../database/postgres/models/index.js";
import { publishWorkflow } from "../services/workflow/publish.service.js";
import {
  loadTriggerSubject,
  matchesTriggerSource,
  REALTIME_TRIGGER_SOURCES,
} from "../services/workflow/triggers/sourceLoader.js";
import { CAMPAIGN_SOURCE_TYPE } from "../config/constants/campaign.js";
import {
  META_IMPORT_SOURCE,
  META_LEAD_STATUS,
} from "../config/constants/metaLead.js";
import * as queues from "../queues/workflowQueues.js";
import { EMAIL_PROVIDER_ID } from "../services/email/config/constants.js";

const {
  Workflow,
  WorkflowEnrollment,
  WorkflowNodeRun,
  WorkflowVersion,
  MetaAccount,
  MetaForm,
  MetaLead,
  LeadEvent,
} = db;

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
const FORM_A = `form-a-${STAMP}`;
const FORM_B = `form-b-${STAMP}`;

const createdWorkflows = [];
const emails = [];

const addr = (label) => {
  const email = `meta-trig+${STAMP}-${label}@example.invalid`;
  emails.push(email);
  return email;
};

/* ── fixtures ────────────────────────────────────────────────────────────── */

const account = await MetaAccount.create({
  name: `trigger-test ${STAMP}`,
  pageId: `page-${STAMP}`,
  // Never used — nothing in this test calls Graph.
  pageTokenEnc: "not-a-real-token",
  enabled: false,
});

for (const [formId, name] of [[FORM_A, "Form A"], [FORM_B, "Form B"]]) {
  await MetaForm.create({
    accountId: account.id,
    formId,
    name: `${name} ${STAMP}`,
    active: true,
  });
}

/** A Meta lead exactly as the importer would write one. */
const makeLead = (overrides = {}) =>
  MetaLead.create({
    metaLeadId: `fb-${STAMP}-${Math.random().toString(36).slice(2, 10)}`,
    accountId: account.id,
    formId: FORM_A,
    pageId: account.pageId,
    formName: "Form A",
    name: "Trigger Test",
    status: META_LEAD_STATUS.NEW,
    importedVia: META_IMPORT_SOURCE.POLL,
    sourceCreatedAt: new Date(),
    ...overrides,
  });

const node = (id, type, config) => ({ id, type, config, position: { x: 0, y: 0 } });

const makeWorkflow = async (name, sources) => {
  const workflow = await Workflow.create({
    name: `[META-TRIG ${STAMP}] ${name}`,
    triggerType: "newActivity",
    triggerConfig: { sources },
    definition: {
      entryNodeId: "w",
      nodes: [
        // Parks here for the whole test, so the send below is reachable —
        // publish requires one — and never reached.
        node("w", "wait", { value: 6, unit: "hours" }),
        node("s", "sendEmail", {
          subject: `[META-TRIG ${STAMP}] never sent`,
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

  const result = await publishWorkflow(workflow);
  if (!result.published) throw new Error(`publish refused: ${result.errors?.join("; ")}`);

  return workflow.reload();
};

console.log("\n════ Facebook lead ads as a trigger ════");

/* ══ 1. it is offered at all ═════════════════════════════════════════════ */

console.log("\n── the source is available ──");

check(
  "metaLeads is a realtime trigger source",
  REALTIME_TRIGGER_SOURCES.includes(CAMPAIGN_SOURCE_TYPE.META_LEADS),
  REALTIME_TRIGGER_SOURCES.join(", "),
);

/* ══ 2. which leads may start a journey ══════════════════════════════════ */

console.log("\n── which leads may start a journey ──");
{
  const live = await makeLead({ email: addr("live") });
  const subject = await loadTriggerSubject("metaLeads", live.id);

  check("a lead that just came in from the live poll", Boolean(subject),
    subject ? `${subject.email}` : "refused");
  check("and it carries the form it came from",
    subject?.raw?.formId === FORM_A, subject?.raw?.formId ?? "none");

  const backfilled = await makeLead({
    email: addr("backfill"),
    importedVia: META_IMPORT_SOURCE.BACKFILL,
  });

  check("a backfilled lead starts nothing",
    (await loadTriggerSubject("metaLeads", backfilled.id)) === null,
    "importedVia=backfill");

  const old = await makeLead({
    email: addr("old"),
    // Two years ago: a real submission, long finished with.
    sourceCreatedAt: new Date(Date.now() - 730 * 24 * 3_600_000),
  });

  check("a lead filled in two years ago starts nothing",
    (await loadTriggerSubject("metaLeads", old.id)) === null,
    "older than the age guard");

  const recent = await makeLead({
    email: addr("recent"),
    // Two hours: a poller that was briefly down, still legitimately new.
    sourceCreatedAt: new Date(Date.now() - 2 * 3_600_000),
  });

  check("a lead from two hours ago still does",
    Boolean(await loadTriggerSubject("metaLeads", recent.id)),
    "inside the age guard");

  const skipped = await makeLead({
    email: addr("skipped"),
    status: META_LEAD_STATUS.SKIPPED,
  });

  check("a skipped lead starts nothing",
    (await loadTriggerSubject("metaLeads", skipped.id)) === null,
    "status=skipped");

  const noEmail = await makeLead({ email: null, phone: "+919999999999" });

  check("a lead with a phone but no email starts nothing",
    (await loadTriggerSubject("metaLeads", noEmail.id)) === null,
    "nothing to mail");

  const duplicate = await makeLead({
    email: addr("dup"),
    status: META_LEAD_STATUS.DUPLICATE,
  });

  // A `duplicate` status means the same *person* filled a second form. That is
  // a real new submission and the enrolment gates decide what to do with it —
  // it is not the importer's `alreadyImported`, which never creates a row.
  check("a lead marked duplicate is still a real submission",
    Boolean(await loadTriggerSubject("metaLeads", duplicate.id)),
    "status=duplicate");
}

/* ══ 3. narrowing by form ════════════════════════════════════════════════ */

console.log("\n── narrowed by form, and only by form ──");
{
  const lead = await makeLead({ email: addr("filter"), formId: FORM_A });
  const subject = await loadTriggerSubject("metaLeads", lead.id);

  const clause = (filters) => ({ type: "metaLeads", filters });

  check("no filter matches every form",
    matchesTriggerSource(subject, clause(undefined)));
  check("an empty filter also matches every form",
    matchesTriggerSource(subject, clause({})));
  check("an empty list matches every form, it does not match none",
    matchesTriggerSource(subject, clause({ formIds: [] })));
  check("its own form matches",
    matchesTriggerSource(subject, clause({ formIds: [FORM_A] })));
  check("another form does not",
    !matchesTriggerSource(subject, clause({ formIds: [FORM_B] })));
  check("one of several matches",
    matchesTriggerSource(subject, clause({ formIds: [FORM_B, FORM_A] })));
  check("a different source type never matches",
    !matchesTriggerSource(subject, { type: "leads", filters: {} }));
}

/* ══ 4. end to end, through the queue ════════════════════════════════════ */

console.log("\n── end to end: a form submission starts the journey ──");
{
  const watching = await makeWorkflow("watches form A", [
    { type: "metaLeads", filters: { formIds: [FORM_A] } },
  ]);

  const ignoring = await makeWorkflow("watches form B", [
    { type: "metaLeads", filters: { formIds: [FORM_B] } },
  ]);

  const email = addr("e2e");

  // The model hook fires on create, exactly as the importer would trigger it.
  await makeLead({ email, formId: FORM_A });

  const enrolment = await until(async () => {
    const row = await WorkflowEnrollment.findOne({
      where: { email, workflowId: watching.id },
    });
    return row ?? null;
  }, { timeoutMs: 45_000, what: "the Meta lead to be enrolled" });

  check("the person was enrolled by the form submission", Boolean(enrolment),
    `enrolmentSource=${enrolment.enrollmentSource}`);
  check("recorded as a realtime enrolment",
    enrolment.enrollmentSource === "newActivity", enrolment.enrollmentSource);
  check("and tagged with the Meta lead it came from",
    enrolment.sourceType === "metaLeads" && Boolean(enrolment.sourceId),
    `${enrolment.sourceType}:${enrolment.sourceId}`);

  // Settle, so a late enrolment into the wrong workflow would still be caught.
  await sleep(5_000);

  const wrong = await WorkflowEnrollment.count({
    where: { email, workflowId: ignoring.id },
  });

  check("the workflow watching a different form enrolled nobody", wrong === 0,
    `${wrong} enrolments`);

  const backfilled = addr("e2e-backfill");
  await makeLead({
    email: backfilled,
    formId: FORM_A,
    importedVia: META_IMPORT_SOURCE.BACKFILL,
    sourceCreatedAt: new Date(Date.now() - 400 * 24 * 3_600_000),
  });

  await sleep(6_000);

  const fromHistory = await WorkflowEnrollment.count({ where: { email: backfilled } });

  check("a backfilled lead enrolled nobody, end to end", fromHistory === 0,
    `${fromHistory} enrolments`);
}

/* ── cleanup ─────────────────────────────────────────────────────────────── */

console.log("\n── cleanup ──");

for (const id of createdWorkflows) {
  const rows = await WorkflowEnrollment.findAll({ where: { workflowId: id }, attributes: ["id"] });
  const ids = rows.map((r) => r.id);

  if (ids.length) {
    await WorkflowNodeRun.destroy({ where: { enrollmentId: ids } });
    await WorkflowEnrollment.destroy({ where: { id: ids } });
  }

  await WorkflowVersion.destroy({ where: { workflowId: id } });
  await Workflow.destroy({ where: { id } });
}

const leadRows = await MetaLead.findAll({ where: { accountId: account.id }, attributes: ["id"] });
const removedEvents = await LeadEvent.destroy({
  where: { sourceId: leadRows.map((r) => r.id) },
});

await MetaLead.destroy({ where: { accountId: account.id } });
await MetaForm.destroy({ where: { accountId: account.id } });
await MetaAccount.destroy({ where: { id: account.id } });

console.log(
  `   removed ${createdWorkflows.length} workflows, ${leadRows.length} meta leads, ` +
    `2 forms, 1 account, ${removedEvents} lead events`,
);

const failed = results.filter((r) => !r.ok);

console.log("\n" + "═".repeat(60));
console.log(`  ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) failed.forEach((f) => console.log(`  FAILED  ${f.label}`));
console.log("═".repeat(60) + "\n");

await queues.closeQueues();
process.exit(failed.length ? 1 : 0);
