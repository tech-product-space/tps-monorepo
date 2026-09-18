import {
  ACTIVITY_ENTITY as E,
  ACTIVITY_VERB as V,
  METHOD_VERB_FALLBACK,
} from "../../config/constants/activityLog.js";

/**
 * Route → activity descriptor.
 *
 * Keys are "<METHOD> <baseUrl><route.path>" — the route *pattern*, not the
 * interpolated URL, so every course update groups under one key regardless of
 * id. The middleware builds the same key from `req.baseUrl + req.route.path`.
 *
 * Adding a feature means adding a line here. Forgetting to is not fatal —
 * `resolveActivity` falls back to a coarse descriptor (see below).
 *
 * Descriptor fields:
 *   entityType   required
 *   verb         required
 *   entityIdFrom "params.<key>" | "response.data.id"   (default "params.id")
 *   labelFrom    "body.<key>"                          (optional)
 *   verbFrom     (ctx) => verb   — for routes whose meaning depends on the result
 *   summary      fixed sentence, when the verb alone is not descriptive
 *   logFailures  also log 4xx/5xx responses (default false)
 *   actorFromResponse  read the actor out of the response (login only)
 *   skip         never log this route
 */
const entry = (entityType, verb, opts = {}) => ({ entityType, verb, ...opts });

export const ACTIVITY_REGISTRY = {
  // ── Admin users & roles ───────────────────────────────────────────────────
  "POST /admins": entry(E.ADMIN, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.email",
  }),
  "PATCH /admins/:id": entry(E.ADMIN, V.UPDATED),
  "DELETE /admins/:id": entry(E.ADMIN, V.DELETED),
  // No `summary` — the verb label plus entityLabel already reads as
  // "Priya resent an invite to asha@example.com".
  "POST /admins/:id/resend-invite": entry(E.ADMIN, V.INVITE_RESENT),
  // Worth logging loudly: one admin setting another's password is the single
  // most abusable action in the panel.
  "POST /admins/:id/reset-password": entry(E.ADMIN, V.PASSWORD_RESET, {
    logFailures: true,
  }),
  "POST /admins/roles": entry(E.ADMIN_ROLE, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
  }),
  "POST /admins/auth/login": entry(E.ADMIN, V.LOGIN, {
    logFailures: true,
    actorFromResponse: true,
    entityIdFrom: "response.data.id",
  }),
  "POST /admins/auth/set-password": entry(E.ADMIN, V.PASSWORD_SET, {
    logFailures: true,
    labelFrom: "body.email",
  }),

  // ── Courses ───────────────────────────────────────────────────────────────
  "POST /courses/admin/create": entry(E.COURSE, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
  }),
  "PUT /courses/admin/courses/:id": entry(E.COURSE, V.UPDATED),
  "PATCH /courses/admin/courses/:id/toggle-status": entry(E.COURSE, V.UPDATED, {
    verbFrom: (ctx) =>
      ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED,
  }),
  "DELETE /courses/admin/courses/:id": entry(E.COURSE, V.DELETED),
  "PUT /courses/admin/courses/:id/brochure": entry(E.COURSE, V.UPDATED, {
    summary: "updated the brochure",
  }),
  "DELETE /courses/admin/courses/:id/brochure": entry(E.COURSE, V.UPDATED, {
    summary: "removed the brochure",
  }),
  "PUT /courses/admin/courses/:id/templates/:type": entry(
    E.EMAIL_TEMPLATE,
    V.UPDATED,
    { entityIdFrom: "params.id" },
  ),
  "POST /courses/admin/courses/:id/templates/:type/test-send": entry(
    E.EMAIL_TEMPLATE,
    V.EMAIL_SENT,
    { entityIdFrom: "params.id", summary: "sent a test email" },
  ),

  // ── Events ────────────────────────────────────────────────────────────────
  // Events name their title field `eventTitle`, not `title` like every other
  // entity here.
  "POST /events/admin/create": entry(E.EVENT, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.eventTitle",
  }),
  "PUT /events/admin/events/:id": entry(E.EVENT, V.UPDATED),
  // The id in the URL is the *source*; the row worth linking to is the copy.
  // The controller adds the source in metadata.
  "POST /events/admin/events/:id/duplicate": entry(E.EVENT, V.DUPLICATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.eventTitle",
  }),
  "PATCH /events/admin/events/:id/toggle-publish": entry(E.EVENT, V.UPDATED, {
    verbFrom: (ctx) => (ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED),
  }),
  "PATCH /events/admin/events/:id/toggle-response": entry(E.EVENT, V.UPDATED, {
    verbFrom: (ctx) =>
      // Opening responses also opens self-registration, which auto-approves
      // whoever uses it — worth being able to see exactly when that window was
      // open and who opened it.
      ctx.response?.canAcceptResponse ? V.PUBLISHED : V.UNPUBLISHED,
    summary: "changed whether the event accepts feedback responses",
  }),
  "PATCH /events/admin/events/:id/settings": entry(E.EVENT, V.UPDATED, {
    summary: "updated the feedback and certificate settings",
  }),
  "DELETE /events/admin/events/:id": entry(E.EVENT, V.DELETED),

  // Event certificates — mounted at /events/certificates
  "PUT /events/certificates/admin/:eventId/template": entry(
    E.EVENT_CERTIFICATE,
    V.UPDATED,
    { entityIdFrom: "params.eventId", summary: "updated the certificate template" },
  ),
  "POST /events/certificates/admin/:eventId/recipients": entry(
    E.EVENT_CERTIFICATE,
    V.CREATED,
    { entityIdFrom: "params.eventId", summary: "created certificate recipients" },
  ),
  // The one that actually sends things to people, so it is worth being able to
  // answer "who approved these, and when" later.
  "PATCH /events/certificates/admin/:eventId/approve": entry(
    E.EVENT_CERTIFICATE,
    V.BULK_UPDATED,
    { entityIdFrom: "params.eventId", summary: "approved certificates for issuing" },
  ),
  // Same consequence as approving — certificates go out — reached from the
  // Feedback tab instead of the certificate list.
  "POST /events/certificates/admin/:eventId/feedback/issue": entry(
    E.EVENT_CERTIFICATE,
    V.BULK_UPDATED,
    {
      entityIdFrom: "params.eventId",
      summary: "generated certificates from feedback responses",
    },
  ),
  "POST /events/certificates/admin/certificates/:id/retry": entry(
    E.EVENT_CERTIFICATE,
    V.UPDATED,
    { summary: "retried a certificate" },
  ),
  "PATCH /events/certificates/admin/certificates/:id/revoke": entry(
    E.EVENT_CERTIFICATE,
    V.UPDATED,
    { summary: "revoked a certificate" },
  ),
  // Reversible, but both directions change what a recipient can download, so
  // both are worth being able to answer "who did that, and when" about.
  "PATCH /events/certificates/admin/certificates/:id/restore": entry(
    E.EVENT_CERTIFICATE,
    V.UPDATED,
    { summary: "restored a revoked certificate" },
  ),
  // Changes whose name is printed on someone's certificate — always logged.
  "PATCH /events/certificates/admin/certificates/:id/recipient": entry(
    E.EVENT_CERTIFICATE,
    V.UPDATED,
    { summary: "corrected a certificate recipient", logFailures: true },
  ),
  // A preview renders but persists nothing.
  "POST /events/certificates/admin/:eventId/preview": entry(
    E.EVENT_CERTIFICATE,
    V.UPDATED,
    { skip: true },
  ),

  // Event email templates — mounted at /events/email
  "POST /events/email/:eventId/template": entry(E.EMAIL_TEMPLATE, V.UPDATED, {
    entityIdFrom: "params.eventId",
    summary: "updated an event email template",
  }),
  "POST /events/email/:eventId/template/test": entry(
    E.EMAIL_TEMPLATE,
    V.EMAIL_SENT,
    {
      entityIdFrom: "params.eventId",
      summary: "sent a test event email",
    },
  ),

  // Event guests — mounted at /events/guest
  "PATCH /events/guest/:guestId/status": entry(
    E.EVENT_GUEST,
    V.STATUS_CHANGED,
    { entityIdFrom: "params.guestId" },
  ),
  "PATCH /events/guest/event/:eventId/status/bulk": entry(
    E.EVENT_GUEST,
    V.BULK_UPDATED,
    { entityIdFrom: "params.eventId" },
  ),
  "PATCH /events/guest/event/:eventId/referral/bulk-approve": entry(
    E.EVENT_GUEST,
    V.BULK_UPDATED,
    {
      entityIdFrom: "params.eventId",
      summary: "bulk-approved guests by referral count",
    },
  ),

  // Event reminders — mounted at /events/reminders
  "POST /events/reminders/": entry(E.EVENT_REMINDER, V.CREATED, {
    entityIdFrom: "response.data.id",
  }),
  "PUT /events/reminders/:id": entry(E.EVENT_REMINDER, V.UPDATED),
  "DELETE /events/reminders/:id": entry(E.EVENT_REMINDER, V.DELETED),
  "POST /events/reminders/:id/schedule": entry(
    E.EVENT_REMINDER,
    V.SCHEDULED,
    {},
  ),
  "POST /events/reminders/:id/cancel": entry(E.EVENT_REMINDER, V.CANCELLED, {}),
  "POST /events/reminders/:id/send-now": entry(
    E.EVENT_REMINDER,
    V.EMAIL_SENT,
    { summary: "sent a reminder immediately" },
  ),
  "POST /events/reminders/:id/send-test-email": entry(
    E.EVENT_REMINDER,
    V.EMAIL_SENT,
    { summary: "sent a test reminder email" },
  ),

  // ── Blogs ─────────────────────────────────────────────────────────────────
  "POST /blogs/admin/create": entry(E.BLOG, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.title",
  }),
  "PUT /blogs/admin/blogs/:id": entry(E.BLOG, V.UPDATED),
  "PATCH /blogs/admin/blogs/:id/toggle-status": entry(E.BLOG, V.UPDATED, {
    verbFrom: (ctx) => (ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED),
  }),
  "DELETE /blogs/admin/blogs/:id": entry(E.BLOG, V.DELETED),

  // ── Resources ─────────────────────────────────────────────────────────────
  "POST /resources/admin/create": entry(E.RESOURCE, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.title",
  }),
  "PUT /resources/admin/resources/:id": entry(E.RESOURCE, V.UPDATED),
  "PATCH /resources/admin/resources/:id/toggle-status": entry(
    E.RESOURCE,
    V.UPDATED,
    {
      verbFrom: (ctx) =>
        ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED,
    },
  ),
  "DELETE /resources/admin/resources/:id": entry(E.RESOURCE, V.DELETED),
  "PUT /resources/:id/email-template": entry(E.EMAIL_TEMPLATE, V.UPDATED, {
    summary: "updated the resource email template",
  }),

  // ── Recordings ────────────────────────────────────────────────────────────
  "POST /recordings/admin/create": entry(E.RECORDING, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.title",
  }),
  "PUT /recordings/admin/recordings/:id": entry(E.RECORDING, V.UPDATED),
  "PATCH /recordings/admin/recordings/:id/toggle-status": entry(
    E.RECORDING,
    V.UPDATED,
    {
      verbFrom: (ctx) =>
        ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED,
    },
  ),
  "DELETE /recordings/admin/recordings/:id": entry(E.RECORDING, V.DELETED),
  "PUT /recordings/admin/recordings/:id/email-template": entry(
    E.EMAIL_TEMPLATE,
    V.UPDATED,
    { summary: "updated the recording email template" },
  ),

  "POST /recordings/admin/categories": entry(E.RECORDING_CATEGORY, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
  }),
  "PUT /recordings/admin/categories/:id": entry(
    E.RECORDING_CATEGORY,
    V.UPDATED,
  ),
  "DELETE /recordings/admin/categories/:id": entry(
    E.RECORDING_CATEGORY,
    V.DELETED,
  ),
  // One row for the whole drag, not one per chip — the interesting fact is
  // that the order changed, and `metadata.affectedCount` carries the size.
  "PATCH /recordings/admin/categories/reorder": entry(
    E.RECORDING_CATEGORY,
    V.REORDERED,
    { summary: "reordered the recording categories" },
  ),

  // ── Projects ──────────────────────────────────────────────────────────────
  "POST /projects/admin/create": entry(E.PROJECT, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.title",
  }),
  "PUT /projects/admin/projects/:id": entry(E.PROJECT, V.UPDATED),
  "PATCH /projects/admin/projects/:id/toggle-status": entry(
    E.PROJECT,
    V.UPDATED,
    {
      verbFrom: (ctx) =>
        ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED,
    },
  ),
  // The only writer of the moderation state, so the only place these two verbs
  // can come from. Kept off the general update for exactly that reason.
  "POST /projects/admin/projects/:id/review": entry(E.PROJECT, V.UPDATED, {
    verbFrom: (ctx) => (ctx.body?.decision === "approved" ? V.APPROVED : V.REJECTED),
  }),
  "DELETE /projects/admin/projects/:id": entry(E.PROJECT, V.DELETED),

  "POST /projects/admin/categories": entry(E.PROJECT_CATEGORY, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
  }),
  "PUT /projects/admin/categories/:id": entry(E.PROJECT_CATEGORY, V.UPDATED),
  "DELETE /projects/admin/categories/:id": entry(E.PROJECT_CATEGORY, V.DELETED),
  "PATCH /projects/admin/categories/reorder": entry(
    E.PROJECT_CATEGORY,
    V.REORDERED,
    { summary: "reordered the project categories" },
  ),

  // Guide steps. The item routes carry a step id and read fine from LABEL_FIELDS;
  // the collection routes carry a project id, so they label from the body.
  "POST /projects/admin/projects/:projectId/steps": entry(
    E.PROJECT_STEP,
    V.CREATED,
    { entityIdFrom: "response.data.id", labelFrom: "body.title" },
  ),
  "PUT /projects/admin/steps/:id": entry(E.PROJECT_STEP, V.UPDATED),
  "PATCH /projects/admin/steps/:id/toggle-status": entry(
    E.PROJECT_STEP,
    V.UPDATED,
    {
      verbFrom: (ctx) =>
        ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED,
    },
  ),
  "DELETE /projects/admin/steps/:id": entry(E.PROJECT_STEP, V.DELETED),
  // One row for the drag, and one for the bulk publish — both carry
  // `metadata.affectedCount`, which is the interesting part. A .docx import
  // that creates eleven steps must not read as a single create.
  "POST /projects/admin/projects/:projectId/steps/import": entry(
    E.PROJECT_STEP,
    V.CREATED,
    { summary: "imported guide steps from a document" },
  ),
  "PUT /projects/admin/projects/:projectId/steps/reorder": entry(
    E.PROJECT_STEP,
    V.REORDERED,
    { summary: "reordered the guide steps" },
  ),
  "PATCH /projects/admin/projects/:projectId/steps/publish-all": entry(
    E.PROJECT_STEP,
    V.BULK_UPDATED,
    { summary: "published every draft step in a project guide" },
  ),

  // The global template is one row that changes what every project mails, so
  // its diff is the only record of who changed the copy that went out.
  "PUT /projects/admin/email-templates/:type": entry(
    E.PROJECT_EMAIL_TEMPLATE,
    V.UPDATED,
    { summary: "updated the global project email template" },
  ),
  "POST /projects/admin/email-templates/:type/test": entry(
    E.PROJECT_EMAIL_TEMPLATE,
    V.EMAIL_SENT,
    { summary: "sent a test project email" },
  ),
  "PUT /projects/admin/projects/:projectId/email/:type": entry(
    E.PROJECT_EMAIL_TEMPLATE,
    V.UPDATED,
  ),
  "DELETE /projects/admin/projects/:projectId/email/:type": entry(
    E.PROJECT_EMAIL_TEMPLATE,
    V.DELETED,
    { summary: "removed a project email override" },
  ),

  // Public writes. Skipped: each is already its own timestamped record, and the
  // actor is a member of the public rather than an admin.
  "POST /projects/public/download": entry(E.PROJECT, V.UPDATED, { skip: true }),
  "POST /projects/public/guide-unlock": entry(E.PROJECT, V.UPDATED, {
    skip: true,
  }),
  "POST /projects/public/submit": entry(E.PROJECT, V.CREATED, { skip: true }),
  "POST /projects/public/steps/:id/complete": entry(E.PROJECT_STEP, V.UPDATED, {
    skip: true,
  }),

  // ── Free courses ──────────────────────────────────────────────────────────
  "POST /free-courses/create": entry(E.FREE_COURSE, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.title",
  }),
  "PUT /free-courses/:id": entry(E.FREE_COURSE, V.UPDATED),
  "DELETE /free-courses/:id": entry(E.FREE_COURSE, V.DELETED),
  // Worth logging: this mints a link that bypasses every publish flag on the
  // course. The token itself is redacted before the row is written.
  "POST /free-courses/:id/preview-token": entry(E.FREE_COURSE, V.PREVIEWED, {
    summary: "Generated a preview link",
  }),
  // One row for the whole batch, with the counts in metadata — fifty-six rows
  // for one "publish the curriculum" would bury everything else in the feed.
  "PATCH /free-courses/:id/curriculum/publish": entry(
    E.FREE_COURSE,
    V.BULK_UPDATED,
    {
      verbFrom: (ctx) =>
        ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED,
      summary: "Bulk-updated the curriculum",
    },
  ),
  "PATCH /free-courses/:id/toggle-status": entry(E.FREE_COURSE, V.UPDATED, {
    verbFrom: (ctx) =>
      ctx.response?.isPublished ?? ctx.response?.isActive
        ? V.PUBLISHED
        : V.UNPUBLISHED,
  }),

  // Modules — mounted at /free-courses/module
  "POST /free-courses/module/create/:courseId": entry(
    E.FREE_COURSE_MODULE,
    V.CREATED,
    { entityIdFrom: "params.courseId", labelFrom: "body.title" },
  ),
  "PUT /free-courses/module/reorder/:courseId": entry(
    E.FREE_COURSE_MODULE,
    V.REORDERED,
    { entityIdFrom: "params.courseId" },
  ),
  "PUT /free-courses/module/update/:id": entry(
    E.FREE_COURSE_MODULE,
    V.UPDATED,
  ),
  "DELETE /free-courses/module/delete/:id": entry(
    E.FREE_COURSE_MODULE,
    V.DELETED,
  ),
  "PATCH /free-courses/module/toggle-status/:id": entry(
    E.FREE_COURSE_MODULE,
    V.UPDATED,
    { summary: "toggled module visibility" },
  ),

  // Lessons — mounted at /free-courses/lesson
  "POST /free-courses/lesson/create/:moduleId": entry(
    E.FREE_COURSE_LESSON,
    V.CREATED,
    { entityIdFrom: "params.moduleId", labelFrom: "body.title" },
  ),
  "PUT /free-courses/lesson/reorder/:moduleId": entry(
    E.FREE_COURSE_LESSON,
    V.REORDERED,
    { entityIdFrom: "params.moduleId" },
  ),
  "PUT /free-courses/lesson/update/:id": entry(
    E.FREE_COURSE_LESSON,
    V.UPDATED,
  ),
  "DELETE /free-courses/lesson/delete/:id": entry(
    E.FREE_COURSE_LESSON,
    V.DELETED,
  ),
  "PATCH /free-courses/lesson/toggle-status/:id": entry(
    E.FREE_COURSE_LESSON,
    V.UPDATED,
    { summary: "toggled lesson visibility" },
  ),

  // Free course certificates — mounted at /free-courses/certificates
  "PUT /free-courses/certificates/admin/:courseId/template": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    { entityIdFrom: "params.courseId", summary: "updated the certificate design" },
  ),
  "PUT /free-courses/certificates/admin/:courseId/email": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    { entityIdFrom: "params.courseId", summary: "updated the certificate email" },
  ),
  // Certificates go out as a result of this, so it is worth being able to
  // answer "who generated these, and when" about a batch.
  "POST /free-courses/certificates/admin/:courseId/generate": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.CREATED,
    {
      entityIdFrom: "params.courseId",
      summary: "generated certificates for completed learners",
    },
  ),
  "POST /free-courses/certificates/admin/certificates/:id/retry": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    { summary: "retried a certificate" },
  ),
  "POST /free-courses/certificates/admin/certificates/:id/resend": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.EMAIL_SENT,
    { summary: "resent a certificate email" },
  ),
  "PATCH /free-courses/certificates/admin/certificates/:id/revoke": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    { summary: "revoked a certificate" },
  ),
  // Reversible, but both directions change what a learner can download, so
  // both are worth being able to answer "who did that, and when" about.
  "PATCH /free-courses/certificates/admin/certificates/:id/restore": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    { summary: "restored a revoked certificate" },
  ),
  // Changes whose name is printed on someone's certificate — always logged,
  // including the failures, because a half-applied correction is exactly the
  // thing you go to the log to reconstruct.
  "PATCH /free-courses/certificates/admin/certificates/:id/recipient": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    { summary: "corrected a certificate recipient", logFailures: true },
  ),
  // Replaces this course's design and/or email with another course's. Worth
  // logging with the source: "why did this course's certificate change?" is
  // otherwise unanswerable, because nothing about the row says it was copied.
  "POST /free-courses/certificates/admin/:courseId/copy": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    {
      entityIdFrom: "params.courseId",
      summary: "copied a certificate setup from another course",
    },
  ),
  // Goes to an address an admin typed, so it is a real send and logged as one.
  "POST /free-courses/certificates/admin/:courseId/email/test": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.EMAIL_SENT,
    {
      entityIdFrom: "params.courseId",
      summary: "sent a test certificate email",
    },
  ),
  // A preview renders but persists nothing.
  "POST /free-courses/certificates/admin/:courseId/preview": entry(
    E.FREE_COURSE_CERTIFICATE,
    V.UPDATED,
    { skip: true },
  ),

  // ── Jobs ──────────────────────────────────────────────────────────────────
  "POST /jobs/admin/create": entry(E.JOB, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.title",
  }),
  "PUT /jobs/admin/jobs/:id": entry(E.JOB, V.UPDATED),
  "DELETE /jobs/admin/jobs/:id": entry(E.JOB, V.DELETED),

  // ── File uploads ──────────────────────────────────────────────────────────
  "POST /upload/admin/:type/upload": entry(E.FILE, V.UPLOADED, {
    entityIdFrom: null,
  }),
  "DELETE /upload/admin/:type/delete-file": entry(E.FILE, V.DELETED, {
    entityIdFrom: null,
  }),

  // ── Public routes, explicitly skipped ─────────────────────────────────────
  // ── Marketing campaigns ───────────────────────────────────────────────────
  // A campaign that goes to thousands of people should say who built it and
  // who pulled the trigger — doubly so because nothing gates sending by role.
  "POST /campaigns": entry(E.CAMPAIGN, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
  }),
  "PATCH /campaigns/:id": entry(E.CAMPAIGN, V.UPDATED),
  "DELETE /campaigns/:id": entry(E.CAMPAIGN, V.DELETED),

  // One route, two very different actions — scheduling is reversible, sending
  // is not — so the log must not render them identically.
  "POST /campaigns/:id/schedule": entry(E.CAMPAIGN, V.SCHEDULED, {
    verbFrom: (ctx) => (ctx.body?.scheduledAt ? V.SCHEDULED : V.EMAIL_SENT),
    logFailures: true,
  }),
  "POST /campaigns/:id/cancel": entry(E.CAMPAIGN, V.CANCELLED),

  // The new row is the interesting one, so the log points at the copy; the
  // controller records which campaign it came from in metadata.
  "POST /campaigns/:id/duplicate": entry(E.CAMPAIGN, V.DUPLICATED, {
    entityIdFrom: "response.data.id",
  }),
  "POST /campaigns/:id/send-test": entry(E.CAMPAIGN, V.EMAIL_SENT, {
    summary: "sent a test email",
  }),
  "POST /campaigns/:id/retry-failed": entry(E.CAMPAIGN, V.EMAIL_SENT, {
    summary: "retried failed recipients",
    logFailures: true,
  }),

  // ── Workflow automation ───────────────────────────────────────────────────
  // Publishing is the consequential one: it puts a workflow live that will
  // email people on its own, with no further click from anybody. The log is
  // the only place that records who did it and which version they shipped.
  "POST /workflows/admin/workflows": entry(E.WORKFLOW, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
  }),
  "PUT /workflows/admin/workflows/:id": entry(E.WORKFLOW, V.UPDATED),
  "DELETE /workflows/admin/workflows/:id": entry(E.WORKFLOW, V.ARCHIVED),

  "POST /workflows/admin/workflows/:id/publish": entry(E.WORKFLOW, V.PUBLISHED, {
    // A publish refused by the validator is worth a row too: "tried to publish
    // and it was not ready" is a real thing to see in a timeline.
    logFailures: true,
  }),
  "POST /workflows/admin/workflows/:id/pause": entry(E.WORKFLOW, V.PAUSED),
  "POST /workflows/admin/workflows/:id/resume": entry(E.WORKFLOW, V.RESUMED),

  // Points at the copy, like the campaign duplicate above.
  "POST /workflows/admin/workflows/:id/duplicate": entry(E.WORKFLOW, V.DUPLICATED, {
    entityIdFrom: "response.data.id",
  }),

  "POST /workflows/admin/workflows/:id/test-email": entry(E.WORKFLOW, V.EMAIL_SENT, {
    summary: "sent a test email",
  }),
  "POST /workflows/admin/workflows/test-email": entry(E.WORKFLOW, V.EMAIL_SENT, {
    summary: "sent a test email",
  }),

  // Running a static list is the moment several thousand people are enrolled.
  // `logFailures` because a Run refused for a disabled environment or a paused
  // workflow is exactly the attempt somebody will later swear they made.
  "POST /workflows/admin/workflows/:id/run": entry(E.WORKFLOW, V.SCHEDULED, {
    summary: "ran a workflow",
    logFailures: true,
  }),
  "POST /workflows/admin/workflows/:id/enroll": entry(E.WORKFLOW, V.UPDATED, {
    summary: "enrolled somebody by hand",
    logFailures: true,
  }),

  // The cap is a system-wide safety rail, so a change to it is worth a row
  // even though it touches no single workflow.
  "PUT /workflows/admin/settings": entry(E.WORKFLOW, V.UPDATED, {
    summary: "changed the workflow limits",
  }),

  // Individual enrolments are deliberately not logged — each is already its own
  // timestamped record, and one workflow run would write thousands of rows into
  // the audit trail. A bulk cancel is a decision rather than a record, so it is.
  "POST /workflows/admin/enrollments/bulk-cancel": entry(E.WORKFLOW, V.BULK_UPDATED, {
    summary: "cancelled enrolments",
  }),
  "POST /workflows/admin/enrollments/:id/cancel": entry(E.WORKFLOW, V.UPDATED, {
    skip: true,
  }),

  // ── Contact lists ─────────────────────────────────────────────────────────
  "POST /contacts/lists": entry(E.CONTACT_LIST, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
  }),
  "PATCH /contacts/lists/:id": entry(E.CONTACT_LIST, V.UPDATED),
  "DELETE /contacts/lists/:id": entry(E.CONTACT_LIST, V.DELETED),

  // The upload controller attaches the created/skipped/invalid counts, which
  // are the only interesting part — "uploaded a contact list" says nothing
  // about whether 4,000 people or 3 arrived.
  "POST /contacts/lists/:id/upload": entry(E.CONTACT_LIST, V.UPLOADED),
  "DELETE /contacts/lists/:id/contacts/:contactId": entry(
    E.CONTACT_LIST,
    V.UPDATED,
    { summary: "removed a contact from the list" },
  ),

  // These are not admin activity, and each already writes its own timestamped
  // record — a Lead row *is* the log of a lead being created. Listed rather
  // than left to the actor check so the intent is visible.
  "POST /leads/": entry(E.LEAD, V.CREATED, { skip: true }),
  "POST /subscribers/": entry(E.SUBSCRIBER, V.CREATED, { skip: true }),
  // Same reasoning: a visitor clicking unsubscribe is not an admin action, and
  // the subscriber row it writes carries its own `unsubscribedAt` and reason —
  // that row *is* the record. Logging it would also copy an email address into
  // a second table for no gain.
  "POST /subscribers/unsubscribe": entry(E.SUBSCRIBER, V.UPDATED, {
    skip: true,
  }),
  "POST /resources/leads/": entry(E.LEAD, V.CREATED, { skip: true }),
  "POST /recordings/public/leads": entry(E.LEAD, V.CREATED, { skip: true }),
  "POST /courses/public/:slug/enroll": entry(E.LEAD, V.CREATED, { skip: true }),
  "POST /courses/public/:slug/brochure": entry(E.LEAD, V.CREATED, {
    skip: true,
  }),
  "POST /events/guest/join": entry(E.EVENT_GUEST, V.CREATED, { skip: true }),
  // The feedback flow is public by design — no admin acts on these, and the
  // EventFeedback / EventGuest rows they write are already the record of what
  // happened. Listed explicitly so a reader can see they were considered.
  "POST /events/feedback/public/lookup": entry(E.EVENT_FEEDBACK, V.UPDATED, {
    skip: true,
  }),
  "POST /events/feedback/public/register": entry(E.EVENT_GUEST, V.CREATED, {
    skip: true,
  }),
  "POST /events/feedback/public/submit": entry(E.EVENT_FEEDBACK, V.CREATED, {
    skip: true,
  }),
  "POST /events/guest/link-account": entry(E.EVENT_GUEST, V.UPDATED, {
    skip: true,
  }),
  "POST /free-courses/user/enroll": entry(E.FREE_COURSE, V.CREATED, {
    skip: true,
  }),
  "POST /free-courses/lesson/complete/:id": entry(
    E.FREE_COURSE_LESSON,
    V.UPDATED,
    { skip: true },
  ),
  "POST /upload/resume": entry(E.FILE, V.UPLOADED, { skip: true }),

  // ── Facebook lead ads ───────────────────────────────────────────
  // Connecting a page means pasting a credential, so these are logged
  // loudly. `pageToken` is redacted by ACTIVITY_REDACT_KEYS — check that is
  // still true before adding any route here that accepts one.
  "POST /meta/accounts": entry(E.META_ACCOUNT, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.name",
    logFailures: true,
  }),
  "PUT /meta/accounts/:id": entry(E.META_ACCOUNT, V.UPDATED),
  "DELETE /meta/accounts/:id": entry(E.META_ACCOUNT, V.DELETED),
  "POST /meta/accounts/:id/validate-token": entry(E.META_ACCOUNT, V.UPDATED, {
    summary: "validated the Facebook page token",
    logFailures: true,
  }),
  "POST /meta/accounts/:id/sync-forms": entry(E.META_ACCOUNT, V.UPDATED, {
    summary: "synced the Facebook lead forms",
  }),

  // The mapping decides where every future lead from this form is
  // attributed, and it is frozen onto each lead at import — so who changed
  // it and when is the first question after a batch lands in the wrong place.
  "PUT /meta/forms/:formId": entry(E.META_FORM, V.UPDATED, {
    entityIdFrom: "params.formId",
    summary: "updated the form mapping",
  }),
  "POST /meta/forms/:formId/backfill": entry(E.META_FORM, V.UPDATED, {
    entityIdFrom: "params.formId",
    summary: "started a lead backfill",
    logFailures: true,
  }),

  "PUT /meta/settings": entry(E.META_ACCOUNT, V.UPDATED, {
    summary: "changed Facebook lead polling",
  }),
  "POST /meta/poll-now": entry(E.META_ACCOUNT, V.UPDATED, {
    summary: "manually fetched Facebook leads",
  }),
  "POST /meta/sync-all": entry(E.META_ACCOUNT, V.UPDATED, {
    summary: "manually synced all Facebook forms",
  }),
  "PATCH /meta/leads/:id": entry(E.META_LEAD, V.UPDATED, {
    summary: "changed a Facebook lead status",
  }),

  // The source catalogue. Worth logging because routing is frozen onto each
  // lead at import — a source retired or renamed today explains why last
  // week's leads look the way they do.
  "POST /meta/sources": entry(E.META_SOURCE, V.CREATED, {
    entityIdFrom: "response.data.id",
    labelFrom: "body.displayName",
  }),
  "PUT /meta/sources/:id": entry(E.META_SOURCE, V.UPDATED),
  "DELETE /meta/sources/:id": entry(E.META_SOURCE, V.DELETED, {
    logFailures: true,
  }),
};

/**
 * Where to find an entity's human name, so the log can fill in `entityLabel`
 * itself when a controller has not.
 *
 * Without this, only creates carry a label (from the request body) and every
 * update reads "updated a blog post" instead of naming it — which defeats the
 * point of the feed. The lookup runs after the response is sent, so its cost is
 * invisible, and it means a new entity needs one line here rather than an edit
 * to every one of its controllers.
 *
 * Deletes cannot use it — the row is gone by the time it would run — so those
 * capture the label in the controller before `destroy()`.
 */
export const LABEL_FIELDS = {
  [E.COURSE]: { model: "Course", field: "name" },
  [E.FREE_COURSE]: { model: "FreeCourse", field: "title" },
  // Keyed by courseId on the design/email/generate routes, so the course title
  // is the right label — the per-certificate routes carry a certificate id and
  // read fine from their summary alone.
  [E.FREE_COURSE_CERTIFICATE]: { model: "FreeCourse", field: "title" },
  [E.FREE_COURSE_MODULE]: { model: "FreeCourseModule", field: "title" },
  [E.FREE_COURSE_LESSON]: { model: "FreeCourseLesson", field: "title" },
  [E.EVENT]: { model: "Event", field: "eventTitle" },
  [E.BLOG]: { model: "Blog", field: "title" },
  [E.RESOURCE]: { model: "Resource", field: "title" },
  [E.RECORDING]: { model: "Recording", field: "title" },
  [E.RECORDING_CATEGORY]: { model: "RecordingCategory", field: "name" },
  [E.PROJECT]: { model: "Project", field: "title" },
  [E.PROJECT_CATEGORY]: { model: "ProjectCategory", field: "name" },
  [E.PROJECT_STEP]: { model: "ProjectStep", field: "title" },
  [E.PROJECT_EMAIL_TEMPLATE]: { model: "ProjectEmailTemplate", field: "subject" },
  [E.JOB]: { model: "jobsBoard", field: "title" },
  [E.ADMIN]: { model: "AdminUser", field: "email" },
  [E.ADMIN_ROLE]: { model: "AdminRole", field: "name" },
  [E.EVENT_REMINDER]: { model: "EventReminder", field: "name" },
  [E.CAMPAIGN]: { model: "Campaign", field: "name" },
  [E.CONTACT_LIST]: { model: "ContactList", field: "name" },
  [E.WORKFLOW]: { model: "Workflow", field: "name" },
  [E.META_ACCOUNT]: { model: "MetaAccount", field: "name" },
  [E.META_FORM]: { model: "MetaForm", field: "name" },
  [E.META_LEAD]: { model: "MetaLead", field: "name" },
  [E.META_SOURCE]: { model: "MetaSource", field: "displayName" },
  // eventGuest, emailTemplate and file have no single obvious name field —
  // their rows rely on the controller or read fine without a label.
};

/**
 * Longest-prefix map for routes with no registry entry. Keeps an unmapped route
 * visible — a coarse row plus its `routeKey` tells you which line to add — which
 * is strictly better than an audit log with silent holes.
 */
const FALLBACK_ENTITY_BY_PREFIX = [
  ["/free-courses/lesson", E.FREE_COURSE_LESSON],
  ["/free-courses/module", E.FREE_COURSE_MODULE],
  ["/free-courses", E.FREE_COURSE],
  ["/events/reminders", E.EVENT_REMINDER],
  ["/events/guest", E.EVENT_GUEST],
  ["/events/email", E.EMAIL_TEMPLATE],
  ["/events/feedback", E.EVENT_FEEDBACK],
  ["/events/certificates", E.EVENT_CERTIFICATE],
  ["/events", E.EVENT],
  ["/courses", E.COURSE],
  ["/blogs", E.BLOG],
  ["/resources", E.RESOURCE],
  ["/recordings", E.RECORDING],
  ["/leads", E.LEAD],
  ["/jobs", E.JOB],
  ["/subscribers", E.SUBSCRIBER],
  ["/campaigns", E.CAMPAIGN],
  ["/meta", E.META_ACCOUNT],
  ["/contacts", E.CONTACT_LIST],
  ["/admins", E.ADMIN],
  ["/upload", E.FILE],
];

/**
 * @param {string} routeKey e.g. "PUT /courses/admin/courses/:id"
 * @param {string} method
 * @param {string} path actual request path, used only for the prefix fallback
 * @returns {{ descriptor: Object, matched: boolean }}
 */
export const resolveActivity = (routeKey, method, path) => {
  const hit = ACTIVITY_REGISTRY[routeKey];

  if (hit) return { descriptor: hit, matched: true };

  const prefixMatch = FALLBACK_ENTITY_BY_PREFIX.find(([prefix]) =>
    path.startsWith(prefix),
  );

  if (!prefixMatch) return { descriptor: null, matched: false };

  return {
    descriptor: {
      entityType: prefixMatch[1],
      verb: METHOD_VERB_FALLBACK[method] || V.UPDATED,
    },
    matched: false,
  };
};

export const buildAction = (entityType, verb) => `${entityType}.${verb}`;
