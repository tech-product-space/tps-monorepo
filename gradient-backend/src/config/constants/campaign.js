export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  /** Matches EVENT_REMINDER_STATUS so both jobs read the same. */
  PROCESSING: "processing",
  SENT: "sent",
  FAILED: "failed",
});

export const CAMPAIGN_RECIPIENT_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  SENT: "sent",
  FAILED: "failed",
  /**
   * Resolved into the audience, then found on the suppression list. The row is
   * kept rather than dropped so "we resolved 12,000 and mailed 11,400" has a
   * visible explanation instead of being an unaccounted gap.
   */
  SUPPRESSED: "suppressed",
});

/**
 * Audience sources. The authority on which of these can actually be resolved is
 * the resolver registry in `services/campaign/recipientResolver/index.js` — this
 * is the vocabulary, that is the implementation.
 */
export const CAMPAIGN_SOURCE_TYPE = Object.freeze({
  LEADS: "leads",
  RESOURCE_LEADS: "resourceLeads",
  /**
   * People who passed a session recording's email gate. Filterable by
   * recording and by category — "everyone who watched an SQL session" is the
   * segment this feature exists to create.
   */
  RECORDING_LEADS: "recordingLeads",
  /**
   * People who passed a project's download gate. Filterable by project,
   * category and level — "everyone who downloaded a beginner Python project"
   * is the segment this exists to create.
   */
  PROJECT_LEADS: "projectLeads",
  EVENT_GUESTS: "eventGuests",
  FREE_COURSE_ENROLMENTS: "freeCourseEnrolments",
  SUBSCRIBERS: "subscribers",
  USERS: "users",
  /** Mostly for `exclude` — "everyone who already got last week's send". */
  CAMPAIGN_RECIPIENTS: "campaignRecipients",
  /** CSV-uploaded lists — the one audience not derived from product activity. */
  CONTACT_LISTS: "contactLists",

  // ── Phase 6 ───────────────────────────────────────────────────────────────
  /** Earned a certificate. The highest-intent audience in the database. */
  CERTIFICATE_HOLDERS: "certificateHolders",
  /** Free-course lesson progress — finished it, or started and stalled. */
  FREE_COURSE_PROGRESS: "freeCourseProgress",
  /** Answered an event's feedback form, or notably did not. */
  EVENT_FEEDBACK: "eventFeedback",
  /** Referred somebody to an event — they have already sold us once. */
  EVENT_REFERRERS: "eventReferrers",

  // ── Facebook lead ads ──────────────────────────────────────────
  /**
   * Leads from Facebook Lead Ad forms. A separate table from `leads`, so
   * this is a separate source rather than a filter on LEADS — filterable by
   * form, campaign, ad set and ad, the same vocabulary the Meta Leads screen
   * uses.
   */
  META_LEADS: "metaLeads",
});

/**
 * How far through a free course somebody is.
 *
 * `COMPLETED` means every published lesson in the course, not "most of them" —
 * a course-completion pitch aimed at someone with three lessons left reads as
 * though nobody checked.
 */
export const FREE_COURSE_PROGRESS_STATE = Object.freeze({
  ANY: "any",
  COMPLETED: "completed",
  IN_PROGRESS: "inProgress",
});

/**
 * Fields a client may write.
 *
 * `status`, `scheduledAt`, `sentAt` and every counter belong to the send job. A
 * stray field in a request body must not be able to mark a campaign as sent, or
 * to rewrite the delivery counts after the fact.
 */
export const CAMPAIGN_EDITABLE_FIELDS = Object.freeze([
  "name",
  "subject",
  "body",
  "senderEmail",
  "senderName",
  "recipientFilters",
]);

/** An empty audience — the shape `recipientFilters` defaults to. */
export const EMPTY_RECIPIENT_FILTERS = Object.freeze({
  include: [],
  exclude: [],
});
