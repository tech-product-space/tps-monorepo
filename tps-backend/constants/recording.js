"use strict";

/**
 * Session recordings — the gated video library at /recordings.
 *
 * Distinct from events (the live sessions, some of which become recordings) and
 * from resources (downloadables). Full design in `../../RECORDINGS_PLAN.md`.
 *
 * A recording holds its own copy of everything its page renders, so a recording
 * whose source session is long gone still displays correctly.
 */

/**
 * The badge on a listing card — what kind of session this was.
 *
 * The first three are the values `events.eventType` is an ENUM of, so a
 * recording of a live session can never disagree with the event it came from.
 * **Masterclass is the fourth, and it has no event type on purpose**: it is the
 * standalone format — a studio session or an imported talk that was never run
 * as an event.
 *
 * `Recordings.format` is a validated STRING rather than an ENUM, which is why
 * adding this was a change to one array and nothing else — no migration.
 */
const RECORDING_FORMATS = Object.freeze([
  "Teardown",
  "Hackathon",
  "Workshop",
  "Masterclass",
]);

/**
 * The blocks `Recordings.content` may hold.
 *
 * `content` is one JSONB column rather than a column per block because the
 * detail page will accumulate more of them, and each new one as its own column
 * is a migration plus a model edit plus a controller change before anybody can
 * type into it.
 *
 * **This constant is the contract.** The admin form renders a section per key
 * and the website renders a block per key, so adding "Prerequisites" later is
 * one entry here plus one in the panel. Without it, `content` is an untyped
 * grab-bag whose shape lives only in a React form, which is how
 * `Resources.resourceDetails` became unreadable.
 */
const RECORDING_CONTENT_KEYS = Object.freeze({
  /** HTML — the "WHAT YOU'LL LEARN" section. */
  WHAT_YOU_WILL_LEARN: "whatYouWillLearn",
  /** HTML — the "WHY THIS TOPIC MATTERS" section. */
  WHY_THIS_MATTERS: "whyThisMatters",
  /** HTML — the "KEY TAKEAWAYS" section. */
  KEY_TAKEAWAYS: "keyTakeaways",
});

const RECORDING_CONTENT_KEY_LIST = Object.values(RECORDING_CONTENT_KEYS);

/**
 * Every value in `content` is an **HTML string** produced by the panel's
 * rich-text editor — paragraphs, headings, lists, links and inline marks.
 *
 * The editor (SimpleEditor, Tiptap) serialises its own schema and nothing else,
 * so the stored markup is constrained to that vocabulary; there is no path from
 * it to a script tag or an event-handler attribute. The website renders these
 * blocks as HTML, at the same trust level as blog bodies.
 */

/**
 * Per-recording switches, stored in `Recordings.settings` (JSONB).
 *
 * Read only through `resolveRecordingSettings()` — never off the model
 * directly, or a row saved before a key existed yields `undefined` and a
 * default-on switch behaves as off.
 */
const RECORDING_SETTINGS_DEFAULTS = Object.freeze({
  /**
   * The email gate. When false the video URL ships with the public payload and
   * the page plays without asking for anything.
   */
  gateVideo: true,
  /** The attendee-count chip. Renders nothing when `attendeeCount` is unset. */
  showAttendeeCount: true,
  /** The "KEEP EXPLORING" sidebar list. */
  showKeepExploring: true,
});

/**
 * Layers the defaults underneath whatever the row stored.
 *
 * @param {object|null} recording a Recording instance or plain row
 * @returns {typeof RECORDING_SETTINGS_DEFAULTS}
 */
const resolveRecordingSettings = (recording) => ({
  ...RECORDING_SETTINGS_DEFAULTS,
  ...(recording?.settings ?? {}),
});

/**
 * How many "KEEP EXPLORING" cards the detail sidebar shows.
 *
 * Used both to cap the admin's manual picks and to size the auto-fill query, so
 * the two cannot disagree about how many the page has room for.
 */
const RECORDING_RELATED_LIMIT = 3;

/** What the gate's attendee toggle may say. Anything else is not stored. */
const RECORDING_ATTENDEE_TYPES = Object.freeze(["Professional", "Student"]);

/**
 * How a lead row came to exist.
 *
 * `FORM` — somebody filled the gate for this recording. `CARRIED` — they
 * clicked play on a recording they had not seen and their most recently
 * confirmed details were copied onto a new row for it.
 *
 * The freshness logic below does not read this. It exists so the leads table
 * does not present the two as the same thing: one is a person choosing to hand
 * over their details for this session, the other is a click.
 */
const RECORDING_LEAD_SOURCE = Object.freeze({
  FORM: "form",
  CARRIED: "carried",
});

/**
 * How long a set of answers may be carried onto new recordings before the
 * person is asked to confirm them.
 *
 * The gate's form is nine fields. Asking for them on every recording is the
 * surest way to lose somebody halfway through a library, so the first pass asks
 * and later recordings carry the answers forward. But carried details go stale
 * — people change jobs, students graduate — so the carry expires.
 *
 * Thirty days is a compromise, not a fact: long enough that an active viewer
 * meets it about once a month, short enough that a job title on a lead is worth
 * acting on. It is also only ever felt on a recording somebody has *not* seen —
 * one they have already unlocked plays on load however old their details are.
 */
const RECORDING_PROFILE_FRESH_DAYS = 30;
// const RECORDING_PROFILE_FRESH_DAYS = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether these answers need confirming before they may be carried again.
 *
 * Two rules, and a null `detailsConfirmedAt` counts as stale — a row that
 * somehow arrives without one should ask rather than pass.
 *
 * The graduation-year rule fires independently of the window: somebody who
 * called themselves a student in a year that has since ended is telling us
 * something we can act on now, not in three weeks. It only fires on a clean
 * four-digit year, because the column is free text and anything else is not
 * evidence of anything — it would re-ask forever.
 */
const isRecordingProfileStale = (lead, now = new Date()) => {
  if (!lead) return true;

  const confirmedAt = lead.detailsConfirmedAt
    ? new Date(lead.detailsConfirmedAt)
    : null;

  if (!confirmedAt || Number.isNaN(confirmedAt.getTime())) return true;

  if (
    now.getTime() - confirmedAt.getTime() >
    RECORDING_PROFILE_FRESH_DAYS * DAY_MS
  ) {
    return true;
  }

  if (lead.attendeeType === "Student") {
    const year = /^\d{4}$/.test(String(lead.graduationYear ?? ""))
      ? Number(lead.graduationYear)
      : null;

    if (year !== null && year < now.getFullYear()) return true;
  }

  return false;
};

module.exports = {
  RECORDING_FORMATS,
  RECORDING_CONTENT_KEYS,
  RECORDING_CONTENT_KEY_LIST,
  RECORDING_SETTINGS_DEFAULTS,
  resolveRecordingSettings,
  RECORDING_RELATED_LIMIT,
  RECORDING_ATTENDEE_TYPES,
  RECORDING_LEAD_SOURCE,
  RECORDING_PROFILE_FRESH_DAYS,
  isRecordingProfileStale,
};
