/**
 * The activity stream.
 *
 * `lead_events` is the one table that answers "what happened to this person, in
 * order". Everything else in the database records an *outcome* in its own shape
 * — a lead row, a registration, a download, a certificate — and none of them can
 * be read together without eight queries and a merge.
 *
 * Two consumers:
 *
 * 1. The person timeline in the admin panel, which is the whole of phase 1.
 * 2. Workflow branch conditions (`WORKFLOW_AUTOMATION_PLAN.md` §7), which ask
 *    "did they do X in the N days after we emailed them". A condition reads this
 *    table and nothing else, which is why the events are recorded even for
 *    sources that will never *start* a workflow.
 *
 * Keyed on lowercased email, like every audience in the system (§8.1).
 */

export const LEAD_EVENT_TYPE = Object.freeze({
  /** Any website form submission that creates a `leads` row. */
  LEAD_CREATED: "lead.created",
  EVENT_REGISTERED: "event.registered",
  EVENT_FEEDBACK_SUBMITTED: "event.feedbackSubmitted",

  RESOURCE_DOWNLOADED: "resource.downloaded",

  /**
   * Passed a session recording's email gate.
   *
   * Recorded once, on the first pass. A repeat pass updates the existing
   * `RecordingLeads` row rather than creating one, so nothing re-emits — a
   * timeline that said "watched a recording" every time somebody opened it on
   * a new phone would be noise, and the workflow would re-enrol them.
   */
  RECORDING_WATCHED: "recording.watched",

  /**
   * Passed a project's download gate.
   *
   * Recorded once, on the first pass. A repeat pass updates the existing
   * `ProjectLeads` row rather than creating one, so nothing re-emits — the
   * gate is a client-side unlock and reappears on every new device, so a
   * timeline that said "downloaded a project" each time would be noise and the
   * workflow would re-enrol them.
   */
  PROJECT_DOWNLOADED: "project.downloaded",

  FREE_COURSE_ENROLLED: "freeCourse.enrolled",
  FREE_COURSE_LESSON_COMPLETED: "freeCourse.lessonCompleted",
  /** Every *published* lesson done — the same rule the campaign resolver uses. */
  FREE_COURSE_COMPLETED: "freeCourse.completed",

  CERTIFICATE_ISSUED: "certificate.issued",

  SUBSCRIBER_UNSUBSCRIBED: "subscriber.unsubscribed",

  /**
   * A workflow node sent an email. Written by the workflow dispatcher in phase
   * 3, not by anything today.
   *
   * It closes the loop that makes conditions worth asking: with the send in the
   * same stream as the outcome, "did they register **after** we emailed them"
   * is one query over one table.
   */
  EMAIL_SENT: "email.sent",
});

/**
 * Which table an event came from.
 *
 * Deliberately the same vocabulary as `CAMPAIGN_SOURCE_TYPE` where they
 * overlap, so a timeline row and a campaign recipient row describe their origin
 * with the same word. `sourceId` is the primary key in that table.
 */
export const LEAD_EVENT_SOURCE_TYPE = Object.freeze({
  LEADS: "leads",
  /**
   * Facebook Lead Ads. A separate table from `leads`, so it needs its own
   * source type — but it deliberately shares `LEAD_EVENT_TYPE.LEAD_CREATED`
   * rather than introducing a `metaLead.created`. A distinct event type would
   * mean every existing workflow silently ignores paid social until someone
   * remembers to duplicate each rule; sharing the type means they all fire,
   * and anything that genuinely needs to discriminate reads `sourceType` or
   * `metadata.channel`.
   */
  META_LEADS: "metaLeads",
  EVENT_GUESTS: "eventGuests",
  EVENT_FEEDBACK: "eventFeedback",
  RESOURCE_LEADS: "resourceLeads",
  RECORDING_LEADS: "recordingLeads",
  PROJECT_LEADS: "projectLeads",
  FREE_COURSE_ENROLMENTS: "freeCourseEnrolments",
  FREE_COURSE_PROGRESS: "freeCourseProgress",
  CERTIFICATES: "certificates",
  SUBSCRIBERS: "subscribers",
  WORKFLOWS: "workflows",
});

/**
 * Human wording for the timeline. One line per event type.
 *
 * Kept here rather than in the panel because the timeline endpoint returns a
 * rendered `label` — the alternative is a second copy of this map in
 * `gradient-admin` that drifts, which is the mistake `LEAD_FORM_LABELS` makes
 * twice over in TPS.
 */
export const LEAD_EVENT_LABEL = Object.freeze({
  [LEAD_EVENT_TYPE.LEAD_CREATED]: "Submitted a form",
  [LEAD_EVENT_TYPE.EVENT_REGISTERED]: "Registered for an event",
  [LEAD_EVENT_TYPE.EVENT_FEEDBACK_SUBMITTED]: "Submitted event feedback",
  [LEAD_EVENT_TYPE.RESOURCE_DOWNLOADED]: "Downloaded a resource",
  [LEAD_EVENT_TYPE.RECORDING_WATCHED]: "Watched a recording",
  [LEAD_EVENT_TYPE.PROJECT_DOWNLOADED]: "Downloaded a project",
  [LEAD_EVENT_TYPE.FREE_COURSE_ENROLLED]: "Enrolled in a free course",
  [LEAD_EVENT_TYPE.FREE_COURSE_LESSON_COMPLETED]: "Completed a lesson",
  [LEAD_EVENT_TYPE.FREE_COURSE_COMPLETED]: "Completed a free course",
  [LEAD_EVENT_TYPE.CERTIFICATE_ISSUED]: "Earned a certificate",
  [LEAD_EVENT_TYPE.SUBSCRIBER_UNSUBSCRIBED]: "Unsubscribed",
  [LEAD_EVENT_TYPE.EMAIL_SENT]: "Received an email",
});

/**
 * Not recorded, and why — so the next person does not go looking.
 *
 * - **`lead.statusChanged`.** `LEAD_STATUS` has six values, but nothing in the
 *   API can move a lead between them — `/leads` exposes create and list only,
 *   so every row is `new` or `duplicate` for life. Add this the day a status
 *   endpoint exists; until then it would be an event type nothing can emit.
 * - **`event.attended`.** Gradient has no attendance anywhere: `EventGuests`
 *   carries `status` (Approved / Waitlisted / Declined), which is a decision
 *   about the registration and not a record of anyone turning up. Feedback
 *   submission is the closest proxy the data actually supports, and it is its
 *   own event above. Add `event.attended` when something writes attendance.
 * - **Email opens and clicks.** Deferred with the SES event pipeline
 *   (`MARKETING_CAMPAIGN_PLAN.md` §9.4–9.5). When that lands, the webhook
 *   writes `email.opened` / `email.clicked` here and nothing else changes.
 */
export const LEAD_EVENT_NOT_RECORDED = Object.freeze([
  "lead.statusChanged",
  "event.attended",
  "email.opened",
  "email.clicked",
]);
