/**
 * Session recordings — the gated video library at /recordings.
 *
 * Distinct from Events (the live sessions, some of which become recordings) and
 * from Resources (downloadables). Full design in `../RECORDINGS_PLAN.md`.
 *
 * A recording holds its own copy of everything its page renders, so a recording
 * whose source event was deleted still displays correctly. The one exception is
 * the cross-sell card, which is a foreign key to `Courses` — see §2.5 of the
 * plan for why that one is a join and not stored copy.
 */

/**
 * There is no format constant, and no `format` column.
 *
 * The badge on a listing card says what kind of session this was, and
 * `Events.eventType` already records that. A stored copy meant two fields free
 * to disagree, and an admin editing the one the page does not read. It is now
 * read through the association: `recording.event?.eventType`, null for a
 * recording with no event, which is the honest answer rather than a stale one.
 */

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
 * one entry here plus one in the panel — no migration. Without it, `content` is
 * an untyped grab-bag whose shape lives only in a React form, which is how
 * `Resources.resourceContent` became unreadable.
 */
export const RECORDING_CONTENT_KEYS = Object.freeze({
  /** HTML — the "WHAT YOU'LL LEARN" section. */
  WHAT_YOU_WILL_LEARN: "whatYouWillLearn",
  /** HTML — the "WHY THIS TOPIC MATTERS" section. */
  WHY_THIS_MATTERS: "whyThisMatters",
});

/**
 * Every value in `content` is an **HTML string** produced by the panel's
 * rich-text editor — paragraphs, headings, lists, links and inline marks.
 *
 * The editor serialises its own schema and nothing else, so the stored markup
 * is constrained to that vocabulary; there is no path from it to a script tag
 * or an event-handler attribute. The website renders these blocks as HTML, at
 * the same trust level as blog bodies.
 *
 * `whatYouWillLearn` was `[{ title, description }]` until 22 Aug 2026, when
 * both blocks became rich text — an editor asking for a headline and one
 * supporting line could not express a numbered list or a link, which is what
 * the copy actually needed. Converted by migration
 * `20260822130000-recording-content-to-html`.
 */

export const RECORDING_CONTENT_KEY_LIST = Object.values(
  RECORDING_CONTENT_KEYS,
);

/**
 * Per-recording switches, stored in `Recordings.settings` (JSONB).
 *
 * Read only through `resolveRecordingSettings()` — never off the model
 * directly, or a row saved before a key existed yields `undefined` and a
 * default-on switch behaves as off. Same rule as `Event.settings` and
 * `FreeCourse.settings`.
 */
export const RECORDING_SETTINGS_DEFAULTS = Object.freeze({
  /**
   * The email gate. When false the video URL ships with the public payload and
   * the page plays without asking for anything.
   */
  gateVideo: true,
  /** The "2,987 Attendees" chip. Renders nothing when `attendeeCount` is unset. */
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
export const resolveRecordingSettings = (recording) => ({
  ...RECORDING_SETTINGS_DEFAULTS,
  ...(recording?.settings ?? {}),
});

/**
 * How many "KEEP EXPLORING" cards the detail sidebar shows.
 *
 * Used both to cap the admin's manual picks and to size the auto-fill query, so
 * the two cannot disagree about how many the page has room for.
 */
export const RECORDING_RELATED_LIMIT = 3;

/**
 * There is no recording email, and no `emailTemplate` shape to name here.
 *
 * A recording used to mail the watch link after the gate. The gate already
 * returns the video in its own response and the player starts on it, so the
 * mail was a second copy of a link the person was already using. It was removed
 * rather than defaulted off — a switch left in place is a mailer waiting to be
 * turned back on by somebody who does not know why it was off.
 */

/**
 * Which of the two paths wrote a `RecordingLeads` row.
 *
 * A person filling the gate for this recording and a person clicking play on
 * their fourth recording are both leads, but they are not the same signal, and
 * the lead table should not present them as though they were.
 */
export const RECORDING_LEAD_SOURCE = Object.freeze({
  /** A human typed or confirmed the form for this recording. */
  FORM: "form",
  /** Their details were copied from an earlier recording when they hit play. */
  CARRIED: "carried",
});

/**
 * How long a set of confirmed details is carried to new recordings before the
 * gate asks the person to check them over.
 *
 * One month, counted as a flat 30 days rather than a calendar month so the
 * window is the same length in February as in July — this is a number support
 * has to be able to explain, and "30 days" needs no explaining.
 *
 * The trade it makes: somebody working through the library over a few weeks
 * fills the form once and never sees it again, while somebody who drops in
 * every couple of months confirms their details each time. Shorter keeps the
 * CRM cleaner, longer keeps the click count down. If the friction shows up in
 * the conversion numbers, this constant is the only thing to change.
 */
export const RECORDING_PROFILE_FRESH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a carried profile has to be confirmed before it is used again.
 *
 * Two ways to go stale, and the second is the one that matters:
 *
 *   the window       30 days since a human last confirmed these details.
 *                    Measured on `detailsConfirmedAt`, never on `createdAt` —
 *                    a carried row is created today out of details typed months
 *                    ago, so `createdAt` would reset the clock on every carry
 *                    and the window would never once expire.
 *
 *   graduation       an attendee who called themselves a Student in a year that
 *                    has since passed. This is the only staleness here that can
 *                    be *detected* rather than waited out, and it is the field
 *                    the audience filters care about most — a working
 *                    professional sitting in a "for students" campaign is the
 *                    exact mistake it exists to prevent.
 *
 * A missing `detailsConfirmedAt` counts as stale. Every row has one after the
 * backfill; one that somehow does not should ask rather than assume.
 *
 * @param {object|null} lead a RecordingLead instance or plain row
 * @param {Date} [now]
 * @returns {boolean}
 */
export const isRecordingProfileStale = (lead, now = new Date()) => {
  if (!lead) return true;

  const confirmedAt = lead.detailsConfirmedAt
    ? new Date(lead.detailsConfirmedAt)
    : null;

  if (!confirmedAt || Number.isNaN(confirmedAt.getTime())) return true;

  if (now.getTime() - confirmedAt.getTime() > RECORDING_PROFILE_FRESH_DAYS * DAY_MS) {
    return true;
  }

  if (lead.attendeeType === "Student") {
    // A string column, and free enough that a non-year can be in it. Only a
    // clean four-digit year is allowed to force a confirmation — anything else
    // is not evidence of anything, and would re-ask forever.
    const year = /^\d{4}$/.test(String(lead.graduationYear ?? ""))
      ? Number(lead.graduationYear)
      : null;

    if (year !== null && year < now.getFullYear()) return true;
  }

  return false;
};
