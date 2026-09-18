/**
 * Trigger filter matching. No database, no Redis:
 *
 *   node src/test/workflowTriggerMatch.test.js
 *
 * This is the logic that decides whether a lead that just landed starts a
 * journey. It is worth testing on its own because both of its failure modes are
 * silent: a filter that matches nothing looks like a quiet workflow, and one
 * that matches everything looks like a workflow that is working — right up
 * until it mails the wrong few thousand people.
 */

import assert from "node:assert";

import { matchesTriggerSource } from "../services/workflow/triggers/sourceLoader.js";
import { CAMPAIGN_SOURCE_TYPE } from "../config/constants/campaign.js";

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

const leadSubject = (raw) => ({
  sourceType: CAMPAIGN_SOURCE_TYPE.LEADS,
  email: "a@b.com",
  raw,
});

const guestSubject = (raw) => ({
  sourceType: CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS,
  email: "a@b.com",
  raw,
});

console.log("\nworkflow trigger matching\n");

/* ── the wildcard rule ──────────────────────────────────────────────────── */

test("no filters at all matches everything", () => {
  const subject = leadSubject({ source: "pm-fellowship", subSource: "brochure" });
  assert.equal(
    matchesTriggerSource(subject, { type: CAMPAIGN_SOURCE_TYPE.LEADS }),
    true,
  );
});

test("an empty filters object also matches everything", () => {
  // TPS distinguishes `{}` from `{ eventFilters: {} }` — one matches all, the
  // other matches none — which its own README lists as a gotcha because the
  // difference is invisible in the UI. One rule here: if you did not narrow
  // it, it matches.
  const subject = leadSubject({ source: "anything", subSource: null });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.LEADS,
      filters: {},
    }),
    true,
  );
});

test("an empty array in a filter matches everything, not nothing", () => {
  const subject = leadSubject({ source: "pm-fellowship" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.LEADS,
      filters: { source: [] },
    }),
    true,
  );
});

/* ── the source must match ──────────────────────────────────────────────── */

test("a clause for a different source never matches", () => {
  assert.equal(
    matchesTriggerSource(leadSubject({ source: "x" }), {
      type: CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS,
    }),
    false,
  );
});

/* ── leads ──────────────────────────────────────────────────────────────── */

test("matches a lead on its source", () => {
  const subject = leadSubject({ source: "pm-fellowship", subSource: "brochure" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.LEADS,
      filters: { source: ["pm-fellowship"] },
    }),
    true,
  );
});

test("rejects a lead from a different source", () => {
  const subject = leadSubject({ source: "ai-program" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.LEADS,
      filters: { source: ["pm-fellowship"] },
    }),
    false,
  );
});

test("sub-source narrows within a source", () => {
  const subject = leadSubject({ source: "pm-fellowship", subSource: "callback" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.LEADS,
      filters: { source: ["pm-fellowship"], subSource: ["brochure"] },
    }),
    false,
  );
});

test("a bare string filter works as well as an array", () => {
  const subject = leadSubject({ source: "pm-fellowship" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.LEADS,
      filters: { source: "pm-fellowship" },
    }),
    true,
  );
});

/* ── event guests ───────────────────────────────────────────────────────── */

test("matches a guest on event, status and attendee type together", () => {
  const subject = guestSubject({
    eventId: "evt1",
    status: "Approved",
    attendeeType: "Professional",
  });

  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS,
      filters: {
        eventIds: ["evt1"],
        status: ["Approved"],
        attendeeType: ["Professional"],
      },
    }),
    true,
  );
});

test("rejects a waitlisted guest when the filter wants approved", () => {
  const subject = guestSubject({ eventId: "evt1", status: "Waitlisted" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS,
      filters: { eventIds: ["evt1"], status: ["Approved"] },
    }),
    false,
  );
});

test("rejects a guest of another event", () => {
  const subject = guestSubject({ eventId: "evt2", status: "Approved" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS,
      filters: { eventIds: ["evt1"] },
    }),
    false,
  );
});

test("ids compare as strings, so a numeric id still matches", () => {
  const subject = guestSubject({ eventId: 42, status: "Approved" });
  assert.equal(
    matchesTriggerSource(subject, {
      type: CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS,
      filters: { eventIds: ["42"] },
    }),
    true,
  );
});

/* ── users ──────────────────────────────────────────────────────────────── */

test("a new account always matches — there is nothing to narrow on", () => {
  assert.equal(
    matchesTriggerSource(
      { sourceType: CAMPAIGN_SOURCE_TYPE.USERS, email: "a@b.com", raw: {} },
      { type: CAMPAIGN_SOURCE_TYPE.USERS, filters: {} },
    ),
    true,
  );
});

/* ── sources that are not realtime triggers ─────────────────────────────── */

test("a source with no matcher matches nothing rather than everything", () => {
  // Certificate holders, feedback and contact lists are audiences, not
  // triggers. Defaulting to true here would silently enrol on events the
  // trigger picker never offered.
  assert.equal(
    matchesTriggerSource(
      {
        sourceType: CAMPAIGN_SOURCE_TYPE.CERTIFICATE_HOLDERS,
        email: "a@b.com",
        raw: {},
      },
      { type: CAMPAIGN_SOURCE_TYPE.CERTIFICATE_HOLDERS, filters: {} },
    ),
    false,
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
