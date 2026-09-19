/**
 * The projects hub at /projects — a browsable library of buildable mini
 * projects, each with a downloadable starter link and an authored guide.
 *
 * Full design in `../PROJECTS_PLAN.md`. Distinct from Resources (one-shot
 * downloadables), from Recordings (gated video) and from Free Courses (a
 * curriculum with enrolment and certificates). A project borrows the category
 * catalogue from Recordings and the step editor from Free Courses, and has
 * neither's completion machinery.
 */

/**
 * Moderation state — *is this ours to show at all?*
 *
 * Deliberately separate from `isPublished`, which answers a different question:
 * *have we chosen to show it?* Approving a community submission does not
 * publish it, because a submission almost always needs a copy edit, a category
 * and a skills list first — and "Approve" must not mean "ship a stranger's
 * prose to production".
 *
 * An admin-created project starts APPROVED and unpublished, so the admin path
 * is the ordinary draft/publish flow and this column is invisible to it.
 */
export const PROJECT_STATUS = Object.freeze({
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const PROJECT_STATUS_LIST = Object.values(PROJECT_STATUS);

/**
 * The one definition of "visible to the public".
 *
 * Both halves or neither: `status` says the project is ours to show, and
 * `isPublished` says we chose to. An endpoint that checks only one of them
 * leaks unreviewed community submissions onto the live site — the exact failure
 * the moderation queue exists to prevent. So it lives here, and every public
 * query spreads it rather than restating the pair.
 */
export const publishedProjectScope = () => ({
  status: PROJECT_STATUS.APPROVED,
  isPublished: true,
});

/** Who wrote the row. Drives the "Community" credit badge on the card. */
export const PROJECT_SOURCE = Object.freeze({
  ADMIN: "admin",
  COMMUNITY: "community",
});

export const PROJECT_SOURCE_LIST = Object.values(PROJECT_SOURCE);

/**
 * Difficulty badge on the card, and a filter on the hub.
 *
 * **Lowercase slugs, not display labels.** The label lives in the frontend. A
 * level in a URL (`?level=beginner`) and a level in the database have to be the
 * same string, or every filter grows a casing fix.
 */
export const PROJECT_LEVEL = Object.freeze({
  BEGINNER: "beginner",
  INTERMEDIATE: "intermediate",
  ADVANCED: "advanced",
});

export const PROJECT_LEVEL_LIST = Object.values(PROJECT_LEVEL);

/**
 * Which path wrote a `ProjectLeads` row.
 *
 * Somebody filling the gate for this project and somebody whose details were
 * carried from an earlier one are both leads, but they are not the same signal
 * and the lead table should not present them as though they were.
 */
export const PROJECT_LEAD_SOURCE = Object.freeze({
  /** A human typed or confirmed the form for this project. */
  FORM: "form",
  /** Details copied from an earlier project's gate pass. */
  CARRIED: "carried",
});

export const PROJECT_LEAD_SOURCE_LIST = Object.values(PROJECT_LEAD_SOURCE);

/**
 * Editable emails, by type.
 *
 * One today. Kept as a vocabulary rather than a hardcoded string because the
 * second one — telling a submitter their project was approved or rejected — is
 * already named as a follow-up in the plan (§11), and rows plus a constant make
 * that a card in admin with no migration.
 */
export const PROJECT_EMAIL_TYPE = Object.freeze({
  /** Sent after somebody passes the download gate. Carries the link. */
  DOWNLOAD_DELIVERY: "downloadDelivery",
  /**
   * Sent to a community submitter the moment their project is received.
   *
   * An acknowledgement, **not** a decision: it says a human will look, and it
   * must never read as though the project is live. The approve/reject mail is
   * still a deliberate non-goal — a submitter hears from us once, and then
   * only from a person.
   */
  SUBMISSION_ACK: "submissionAck",
});

export const PROJECT_EMAIL_TYPE_LIST = Object.values(PROJECT_EMAIL_TYPE);

/**
 * Merge fields each email type may use, keyed by type.
 *
 * Listed here so the admin editor can render the reference from the same source
 * the sender substitutes from — a documented tag the sender does not know about
 * is worse than no documentation. Keyed rather than flat because the two types
 * genuinely differ: offering `{{downloadUrl}}` on a submission acknowledgement
 * would document a tag that can only ever render empty.
 */
export const PROJECT_EMAIL_MERGE_FIELDS = Object.freeze({
  [PROJECT_EMAIL_TYPE.DOWNLOAD_DELIVERY]: Object.freeze([
    "name",
    "projectTitle",
    "downloadUrl",
    "projectUrl",
  ]),
  /**
   * No `downloadUrl` and no `projectUrl`: neither exists yet. The project is
   * unpublished and unreviewed, and `projectLink` is the submitter's own link
   * echoed back so they can see we read the right one.
   */
  [PROJECT_EMAIL_TYPE.SUBMISSION_ACK]: Object.freeze([
    "name",
    "projectTitle",
    "projectLink",
  ]),
});

/**
 * Per-project switches, stored in `Projects.settings` (JSONB).
 *
 * Read **only** through `resolveProjectSettings()` — never off the model
 * directly, or a row saved before a key existed yields `undefined` and a
 * default-on switch behaves as off. Same rule as `Event.settings`,
 * `FreeCourse.settings` and `Recording.settings`.
 */
export const PROJECT_SETTINGS_DEFAULTS = Object.freeze({
  /**
   * The download gate. When false, `downloadUrl` ships with the public payload
   * and the gate endpoint is not on the path to this project at all.
   */
  gateDownload: true,
  /**
   * The guide gate. When true, everything past the free steps is withheld
   * until the reader has passed the same name/email/phone form the download
   * uses — and passing either one opens both, because asking the same person
   * for the same three fields twice on one page is how you lose them.
   *
   * Off means the whole guide reads for anybody, which is also what it means
   * for search: a gated step is a step Google cannot index.
   */
  gateGuide: true,
  /**
   * How many steps read free before the gate.
   *
   * A number rather than a boolean because the trade-off is a dial, not a
   * switch: 1 converts hardest, 3–4 leaves the setup steps earning search
   * traffic, and finding the right point needs changing a value, not a deploy.
   * Never lock the whole guide — a reader who has seen nothing has no reason
   * to hand over an email.
   */
  freeGuideSteps: 1,
  /**
   * The tick marks and "Resume" in the guide sidebar. Off for a guide short
   * enough that progress is noise.
   */
  trackProgress: true,
});

/**
 * Layers the defaults underneath whatever the row stored.
 *
 * @param {object|null} project a Project instance or plain row
 * @returns {typeof PROJECT_SETTINGS_DEFAULTS}
 */
export const resolveProjectSettings = (project) => {
  const settings = {
    ...PROJECT_SETTINGS_DEFAULTS,
    ...(project?.settings ?? {}),
  };

  // Clamped here rather than trusted from the column: this decides what the
  // public can read, and a hand-edited `0` would lock a guide's front door
  // while a negative number would make every comparison against it meaningless.
  const free = Number(settings.freeGuideSteps);
  settings.freeGuideSteps =
    Number.isFinite(free) && free >= 1 ? Math.floor(free) : 1;

  return settings;
};

/**
 * Whether this step is behind the guide gate.
 *
 * One function, used by the step endpoint and the project payload alike, so
 * "which steps are locked" cannot be answered two different ways.
 *
 * @param {object} settings resolved project settings
 * @param {number} index the step's position in the published guide, 0-based
 */
export const isGuideStepGated = (settings, index) =>
  Boolean(settings?.gateGuide) && index >= (settings?.freeGuideSteps ?? 1);

/**
 * How long an unlock lasts in a browser.
 *
 * Long, deliberately. The lead row already exists, so asking again buys us
 * nothing and costs a reader. It is not the same clock as
 * `PROJECT_PROFILE_FRESH_DAYS`, which only decides whether details are fresh
 * enough to prefill another project's form — stale details mean "confirm
 * these", never "prove yourself again".
 */
export const PROJECT_UNLOCK_DAYS = 180;

/** One cookie per project, so an unlock is scoped to what was paid for. */
export const projectUnlockCookieName = (projectId) =>
  `gradient_project_unlock_${projectId}`;

/**
 * How many "more like this" cards the guide shows.
 *
 * Used both to cap the admin's manual picks and to size the auto-fill query, so
 * the two cannot disagree about how many the page has room for.
 */
export const PROJECT_RELATED_LIMIT = 3;

/**
 * How long a set of confirmed gate details is carried to new projects before
 * the form asks the person to check them over.
 *
 * 30 flat days, matching `RECORDING_PROFILE_FRESH_DAYS` — this is a number
 * support has to be able to explain, and two different windows for two gates
 * would be two explanations.
 */
export const PROJECT_PROFILE_FRESH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether carried details have to be confirmed again before they are reused.
 *
 * **Measured on `detailsConfirmedAt`, never on `createdAt`.** A carried row is
 * created today out of details typed months ago; measuring on `createdAt` would
 * reset the clock on every carry and the window would never once expire.
 *
 * A missing `detailsConfirmedAt` counts as stale — a row that somehow lacks one
 * should ask rather than assume.
 *
 * @param {object|null} lead a ProjectLead instance or plain row
 * @param {Date} [now]
 * @returns {boolean}
 */
export const isProjectProfileStale = (lead, now = new Date()) => {
  if (!lead) return true;

  const confirmedAt = lead.detailsConfirmedAt
    ? new Date(lead.detailsConfirmedAt)
    : null;

  if (!confirmedAt || Number.isNaN(confirmedAt.getTime())) return true;

  return (
    now.getTime() - confirmedAt.getTime() > PROJECT_PROFILE_FRESH_DAYS * DAY_MS
  );
};

/**
 * There is no `PROJECT_CONTENT_KEYS`, and no `content` column on `Projects`.
 *
 * An earlier draft had one — prose blocks keyed by a fixed contract, copied
 * from `RECORDING_CONTENT_KEYS`. The guide replaced it: a fixed set of named
 * blocks cannot express "five ordered steps, and the next project has seven".
 * Everything that would have gone in `content` is step 1 of the guide, which is
 * what the reference design actually shows — its overview page *is* the first
 * sidebar item, not a separate screen above the guide.
 *
 * Keeping both would have been the real mistake: two places to author prose,
 * and no rule for which one the page leads with.
 */
