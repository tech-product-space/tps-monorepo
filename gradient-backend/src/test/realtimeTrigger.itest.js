/**
 * The live ("as people arrive") trigger, end to end.
 *
 * Nothing here calls the engine directly. Each check **creates a real row in a
 * real table** — a lead, a Facebook lead, an event registration, a resource
 * download, a free-course enrolment, an account — and then waits for the model
 * hook, the queue, the evaluator and the enrolment service to do the rest. That
 * is the whole point: the parts were already unit-tested and the wiring between
 * them was not, and every bug found in this feature so far has lived in the
 * wiring.
 *
 * Needs Postgres, Redis and the worker (`npm run worker`).
 *
 * Sends no email — every fixture workflow parks on a wait before its send step.
 * Every address is `@example.invalid`, which cannot receive mail.
 *
 * Events, resources and free courses are **read** from whatever already exists
 * rather than created: those tables have long required-field lists and this test
 * has no business writing to them. A source with nothing to point at is reported
 * SKIPPED, never passed.
 */

import "dotenv/config";

import db from "../database/postgres/models/index.js";
import { publishWorkflow } from "../services/workflow/publish.service.js";
import { suppress } from "../services/subscriber/suppression.service.js";
import * as queues from "../queues/workflowQueues.js";
import {
  META_IMPORT_SOURCE,
  META_LEAD_STATUS,
} from "../config/constants/metaLead.js";
import { EMAIL_PROVIDER_ID } from "../services/email/config/constants.js";

const {
  Workflow,
  WorkflowEnrollment,
  WorkflowNodeRun,
  WorkflowVersion,
  Lead,
  MetaAccount,
  MetaForm,
  MetaLead,
  EventGuest,
  ResourceLead,
  FreeCourseEnrollment,
  User,
  LeadEvent,
  Subscriber,
  Event,
  Resource,
  FreeCourse,
  sequelize,
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
 * The first version let a `notNull` violation on one table throw out of the
 * whole script — which skipped the cleanup at the bottom and left rows behind
 * in a shared database. A test that litters when it fails is worse than none.
 */
const attempt = async (label, fn) => {
  try {
    await fn();
  } catch (error) {
    check(label, false, `fixture failed: ${error.message.split("\n")[0]}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for an enrolment to appear. Returns null rather than throwing. */
const waitForEnrolment = async (email, workflowId, timeoutMs = 40_000) => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const row = await WorkflowEnrollment.findOne({
      where: { email: email.toLowerCase(), ...(workflowId ? { workflowId } : {}) },
    });

    if (row) return row;
    if (Date.now() > deadline) return null;

    await sleep(750);
  }
};

const STAMP = Date.now().toString(36);
const createdWorkflows = [];
const createdEmails = [];

const addr = (label) => {
  const email = `rt-trig+${STAMP}-${label}@example.invalid`;
  createdEmails.push(email);
  return email;
};

const node = (id, type, config) => ({ id, type, config, position: { x: 0, y: 0 } });

/**
 * A workflow that enrols and then parks, forever, before its send step.
 *
 * Publish requires a reachable send; parking in front of it means the test can
 * prove enrolment without proving anything about anybody's inbox.
 */
const makeWorkflow = async (name, sources, extra = {}) => {
  const workflow = await Workflow.create({
    name: `[RT-TRIG ${STAMP}] ${name}`,
    triggerType: "newActivity",
    triggerConfig: { sources, ...extra },
    definition: {
      entryNodeId: "w",
      nodes: [
        node("w", "wait", { value: 12, unit: "hours" }),
        node("s", "sendEmail", {
          subject: `[RT-TRIG ${STAMP}] never sent`,
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

console.log("\n════ the live trigger, end to end ════");

/* ── Facebook fixtures: this test owns them, so it may create them ──────── */

const FORM_A = `rt-form-a-${STAMP}`;
const FORM_B = `rt-form-b-${STAMP}`;

const metaAccount = await MetaAccount.create({
  name: `rt-trigger-test ${STAMP}`,
  pageId: `rt-page-${STAMP}`,
  pageTokenEnc: "not-a-real-token",
  enabled: false,
});

for (const [formId, name] of [[FORM_A, "Enrolment Form"], [FORM_B, "Curriculum Download"]]) {
  await MetaForm.create({
    accountId: metaAccount.id,
    formId,
    name: `${name} ${STAMP}`,
    active: true,
  });
}

const makeMetaLead = (overrides = {}) =>
  MetaLead.create({
    metaLeadId: `rt-fb-${STAMP}-${Math.random().toString(36).slice(2, 10)}`,
    accountId: metaAccount.id,
    formId: FORM_A,
    pageId: metaAccount.pageId,
    name: "Realtime Test",
    status: META_LEAD_STATUS.NEW,
    importedVia: META_IMPORT_SOURCE.POLL,
    sourceCreatedAt: new Date(),
    ...overrides,
  });

/* ── what already exists to point at ─────────────────────────────────────── */

const anEvent = await Event.findOne({ order: [["createdAt", "DESC"]] });
const aResource = await Resource.findOne({ order: [["createdAt", "DESC"]] });
const aCourse = await FreeCourse.findOne({ order: [["createdAt", "DESC"]] });

/**
 * Runs one check with **only its own workflow live**, then pauses it.
 *
 * Not tidiness — correctness. The cap is one live workflow per person, so a
 * catch-all workflow left active from an earlier check enrols the next check's
 * lead first, and every later assertion then fails against a workflow that was
 * refused with `capped`. The first run of this file failed four checks exactly
 * that way, and all four were the harness rather than the product.
 *
 * Paused rather than archived: `evaluateTriggers` only ever looks at `active`,
 * and a paused row is still readable afterwards if a failure needs explaining.
 */
const withWorkflow = async (name, sources, fn) => {
  const workflow = await makeWorkflow(name, sources);

  try {
    await fn(workflow);
  } finally {
    await workflow.update({ status: "paused" });
  }
};

/* ══ 1. every source enrols ══════════════════════════════════════════════ */

heading("each source starts a journey");

await attempt("a website lead", () =>
  withWorkflow("website leads", [{ type: "leads", filters: {} }], async (wf) => {
    const email = addr("lead");

    await Lead.create({
      name: "Website Lead",
      email,
      phone: "+910000000001",
      source: "rt-verify",
      subSource: "rt-verify-sub",
    });

    const row = await waitForEnrolment(email, wf.id);

    check("a website lead", row?.sourceType === "leads", row?.sourceType ?? "never enrolled");
    check("  …carries the person's name", row?.name === "Website Lead", row?.name ?? "none");
  }),
);

await attempt("a Facebook lead form", () =>
  withWorkflow("facebook leads", [{ type: "metaLeads", filters: {} }], async (wf) => {
    const email = addr("meta");

    await makeMetaLead({ email, name: "Facebook Lead" });

    const row = await waitForEnrolment(email, wf.id);

    check("a Facebook lead form", row?.sourceType === "metaLeads",
      row?.sourceType ?? "never enrolled");
  }),
);

if (anEvent) {
  await attempt("an event registration", () =>
    withWorkflow("event guests", [{ type: "eventGuests", filters: {} }], async (wf) => {
      const email = addr("event");

      await EventGuest.create({
        eventId: anEvent.id,
        name: "Event Guest",
        email,
        phone: "+910000000002",
        isAccountLinked: false,
        attendeeType: "Student",
      });

      const row = await waitForEnrolment(email, wf.id);

      check("an event registration", row?.sourceType === "eventGuests",
        row?.sourceType ?? "never enrolled");
    }),
  );
} else {
  skip("an event registration", "no events exist to register for");
}

if (aResource) {
  await attempt("a resource download", () =>
    withWorkflow("resource leads", [{ type: "resourceLeads", filters: {} }], async (wf) => {
      const email = addr("resource");

      await ResourceLead.create({
        resourceId: aResource.id,
        name: "Resource Downloader",
        email,
        phone: "+910000000003",
      });

      const row = await waitForEnrolment(email, wf.id);

      check("a resource download", row?.sourceType === "resourceLeads",
        row?.sourceType ?? "never enrolled");
    }),
  );
} else {
  skip("a resource download", "no resources exist to download");
}

await attempt("an account signup", () =>
  withWorkflow("accounts", [{ type: "users", filters: {} }], async (wf) => {
    const email = addr("user");

    await User.create({ fullName: "New Account", email, phone: "+910000000004" });

    const row = await waitForEnrolment(email, wf.id);

    check("an account signup", row?.sourceType === "users", row?.sourceType ?? "never enrolled");
    // `users.full_name`, not `users.name`. This read `row.name` — which does
    // not exist — so the first email would have opened "Hi ,".
    check("  …carries the person's name", row?.name === "New Account", row?.name ?? "null");
  }),
);

if (aCourse) {
  await attempt("a free course enrolment", () =>
    withWorkflow("free courses", [{ type: "freeCourseEnrolments", filters: {} }], async (wf) => {
      const email = addr("course");

      // No `users` trigger is live here, so nothing competes for this person
      // and the enrolment below can only have come from the course.
      const user = await User.create({ fullName: "Course Starter", email });

      await FreeCourseEnrollment.create({
        userId: user.id,
        courseId: aCourse.id,
        name: "Course Starter",
        phone: "+910000000005",
      });

      const row = await waitForEnrolment(email, wf.id);

      check("a free course enrolment", row?.sourceType === "freeCourseEnrolments",
        row?.sourceType ?? "never enrolled");
    }),
  );
} else {
  skip("a free course enrolment", "no free courses exist to start");
}

/* ══ 2. narrowing actually narrows ═══════════════════════════════════════ */

heading("narrowing decides who starts it");

await attempt("narrowing by Facebook form", () =>
  withWorkflow("only form A", [{ type: "metaLeads", filters: { formIds: [FORM_A] } }],
    async (wf) => {
      const matching = addr("narrow-hit");
      await makeMetaLead({ email: matching, formId: FORM_A });

      check("the Facebook form it watches enrols",
        Boolean(await waitForEnrolment(matching, wf.id)), "");

      const other = addr("narrow-miss");
      await makeMetaLead({ email: other, formId: FORM_B });

      // Long enough that a slow enrolment would still have landed.
      await sleep(8_000);

      const miss = await WorkflowEnrollment.count({
        where: { email: other, workflowId: wf.id },
      });

      check("a different Facebook form does not", miss === 0, `${miss} enrolments`);
    }),
);

await attempt("narrowing by website form", () =>
  withWorkflow("one lead source", [{ type: "leads", filters: { source: ["rt-verify-narrow"] } }],
    async (wf) => {
      const matching = addr("lead-hit");
      await Lead.create({ name: "Narrow Hit", email: matching, source: "rt-verify-narrow" });

      check("the website form it watches enrols",
        Boolean(await waitForEnrolment(matching, wf.id)), "");

      const other = addr("lead-miss");
      await Lead.create({ name: "Narrow Miss", email: other, source: "rt-verify-other" });

      await sleep(8_000);

      const miss = await WorkflowEnrollment.count({
        where: { email: other, workflowId: wf.id },
      });

      check("a lead from a different form does not", miss === 0, `${miss} enrolments`);
    }),
);

/* ══ 3. the gates ════════════════════════════════════════════════════════ */

heading("what stops a trigger firing");

await attempt("the gates", async () => {
  /* an unpublished draft, live alongside a published one */
  const draft = await Workflow.create({
    name: `[RT-TRIG ${STAMP}] never published`,
    triggerType: "newActivity",
    triggerConfig: { sources: [{ type: "leads", filters: {} }] },
    definition: {
      entryNodeId: "w",
      nodes: [node("w", "wait", { value: 12, unit: "hours" })],
      edges: [],
    },
  });
  createdWorkflows.push(draft.id);

  await withWorkflow("published one", [{ type: "leads", filters: {} }], async (live) => {
    const email = addr("gates");
    await Lead.create({ name: "Gate Test", email, source: "rt-verify" });

    check("a published workflow enrols",
      Boolean(await waitForEnrolment(email, live.id)), "");

    const fromDraft = await WorkflowEnrollment.count({
      where: { email, workflowId: draft.id },
    });
    check("an unpublished draft enrols nobody", fromDraft === 0, `${fromDraft} enrolments`);

    /* paused */
    await live.update({ status: "paused" });

    const whilePaused = addr("paused");
    await Lead.create({ name: "Paused Test", email: whilePaused, source: "rt-verify" });

    await sleep(8_000);

    const paused = await WorkflowEnrollment.count({
      where: { email: whilePaused, workflowId: live.id },
    });
    check("a paused workflow enrols nobody", paused === 0, `${paused} enrolments`);

    await live.update({ status: "active" });

    /* unsubscribed */
    const optedOut = addr("suppressed");
    await suppress({ email: optedOut, reason: "realtime trigger verification" });

    await Lead.create({ name: "Opted Out", email: optedOut, source: "rt-verify" });

    await sleep(8_000);

    const suppressed = await WorkflowEnrollment.count({ where: { email: optedOut } });
    check("somebody who has unsubscribed is never enrolled", suppressed === 0,
      `${suppressed} enrolments`);
  });
});

/* ══ 4. a rolled-back submission enrols nobody ═══════════════════════════ */

heading("a form submission that fails half way");

await attempt("rollback", () =>
  withWorkflow("rollback", [{ type: "leads", filters: {} }], async (wf) => {
    const email = addr("rollback");

    /**
     * Sequelize hooks run *before* commit. `emitTriggerEvent` defers to
     * `transaction.afterCommit` for exactly this reason — without it, a
     * submission that failed validation on a later step would still enrol
     * somebody who does not exist in the leads table.
     */
    try {
      await sequelize.transaction(async (t) => {
        await Lead.create(
          { name: "Rolled Back", email, source: "rt-verify" },
          { transaction: t },
        );

        throw new Error("deliberate rollback");
      });
    } catch {
      // expected
    }

    await sleep(8_000);

    const leadRows = await Lead.count({ where: { email } });
    const enrolments = await WorkflowEnrollment.count({
      where: { email, workflowId: wf.id },
    });

    check("the lead really was rolled back", leadRows === 0, `${leadRows} lead rows`);
    check("and nobody was enrolled from it", enrolments === 0, `${enrolments} enrolments`);
  }),
);

/* ══ 5. the same person arriving twice ═══════════════════════════════════ */

heading("the same person arriving twice");

await attempt("re-entry", () =>
  withWorkflow("re-entry", [{ type: "leads", filters: {} }], async (wf) => {
    const email = addr("twice");

    await Lead.create({ name: "First Time", email, source: "rt-verify" });

    check("enrolled the first time",
      Boolean(await waitForEnrolment(email, wf.id)), "");

    await Lead.create({ name: "Second Time", email, source: "rt-verify" });
    await sleep(8_000);

    const count = await WorkflowEnrollment.count({
      where: { email, workflowId: wf.id },
    });

    // `allowReEnrollment` is off by default, and a live enrolment blocks a
    // second one regardless — somebody filling two forms should not walk the
    // same journey twice at once.
    check("a second submission does not enrol them again", count === 1,
      `${count} enrolments`);
  }),
);

/* ── cleanup ─────────────────────────────────────────────────────────────── */

heading("cleanup");

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

// Anything the fixtures left behind, by the addresses this run minted.
const metaIds = (
  await MetaLead.findAll({ where: { accountId: metaAccount.id }, attributes: ["id"] })
).map((r) => r.id);

const leadIds = (
  await Lead.findAll({ where: { email: createdEmails }, attributes: ["id"] })
).map((r) => r.id);

const removedEvents = await LeadEvent.destroy({
  where: { sourceId: [...metaIds, ...leadIds] },
});

await LeadEvent.destroy({ where: { email: createdEmails } });

await FreeCourseEnrollment.destroy({
  where: { userId: (await User.findAll({ where: { email: createdEmails }, attributes: ["id"] })).map((r) => r.id) },
});

await EventGuest.destroy({ where: { email: createdEmails } });
await ResourceLead.destroy({ where: { email: createdEmails } });
await Lead.destroy({ where: { email: createdEmails } });
await User.destroy({ where: { email: createdEmails } });
await Subscriber.destroy({ where: { email: createdEmails } });

await MetaLead.destroy({ where: { accountId: metaAccount.id } });
await MetaForm.destroy({ where: { accountId: metaAccount.id } });
await MetaAccount.destroy({ where: { id: metaAccount.id } });

console.log(
  `   removed ${createdWorkflows.length} workflows, ${createdEmails.length} people ` +
    `across every source table, and ${removedEvents} lead events`,
);

/* ── the tally ───────────────────────────────────────────────────────────── */

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
const passed = results.filter((r) => r.ok === true);

console.log("\n" + "═".repeat(60));
console.log(
  `  ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`,
);
failed.forEach((f) => console.log(`  FAILED   ${f.section} → ${f.label}`));
skipped.forEach((s) => console.log(`  SKIPPED  ${s.section} → ${s.label}`));
console.log("═".repeat(60) + "\n");

await queues.closeQueues();
process.exit(failed.length ? 1 : 0);
