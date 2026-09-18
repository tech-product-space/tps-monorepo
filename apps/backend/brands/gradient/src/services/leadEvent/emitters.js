import {
  LEAD_EVENT_TYPE,
  LEAD_EVENT_SOURCE_TYPE,
} from "../../config/constants/leadEvent.js";
import { emitLeadEvent, recordLeadEvent } from "./recordLeadEvent.service.js";
import logger from "../../util/logger.js";

/**
 * One emitter per source row.
 *
 * Model hooks call these, and each one is a one-liner at the call site — all of
 * the knowledge about how to get an email out of a given table and what a
 * duplicate of that event would look like lives here.
 *
 * **Why the lookups are in this file and not in the hooks.** Three of the source
 * rows do not carry an email: `EventFeedbacks` links through `guestId`, and both
 * free-course tables link through `userId`. Putting the join in the hook would
 * put a query on the request path; putting it here means it happens after
 * commit, detached, where a slow lookup delays nothing.
 *
 * Every function is safe to call twice — see the `dedupeKey` on each.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §5.1 and §7.1.
 */

/** Lazy for the same cycle reason as the recorder — see that file's note. */
const getModels = async () =>
  (await import("../../database/postgres/models/index.js")).default;

/** Guards a lookup so a missing association can never reach the caller. */
const safely = async (what, fn) => {
  try {
    return await fn();
  } catch (error) {
    logger.error(`Lead event emitter failed: ${what}`, { error: error.message });
    return null;
  }
};

/* ── leads ──────────────────────────────────────────────────────────────── */

export const emitLeadCreated = (lead, options = {}) =>
  emitLeadEvent(
    {
      email: lead.email,
      eventType: LEAD_EVENT_TYPE.LEAD_CREATED,
      occurredAt: lead.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.LEADS,
      sourceId: lead.id,
      metadata: {
        source: lead.source ?? null,
        subSource: lead.subSource ?? null,
        courseId: lead.courseId ?? null,
        status: lead.status ?? null,
      },
      // One lead row is one submission, so its id is the natural key.
      dedupeKey: `lead.created:${lead.id}`,
    },
    options,
  );

/* ── events ─────────────────────────────────────────────────────────────── */

export const emitEventRegistered = (guest, options = {}) =>
  emitLeadEvent(
    {
      email: guest.email,
      eventType: LEAD_EVENT_TYPE.EVENT_REGISTERED,
      occurredAt: guest.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.EVENT_GUESTS,
      sourceId: guest.id,
      metadata: {
        eventId: guest.eventId ?? null,
        status: guest.status ?? null,
        attendeeType: guest.attendeeType ?? null,
      },
      dedupeKey: `event.registered:${guest.id}`,
    },
    options,
  );

/**
 * Feedback carries no email of its own — it points at the guest who submitted
 * it, so the address has to be fetched.
 *
 * Deferred to after-commit by `emitLeadEvent`, which matters here beyond the
 * usual reason: the guest row and the feedback row are frequently written in
 * one transaction, and a lookup before commit would not find the guest.
 */
export const emitEventFeedbackSubmitted = (feedback, options = {}) => {
  const fire = async () => {
    const { EventGuest } = await getModels();

    const guest = await safely("eventFeedback → guest", () =>
      EventGuest.findByPk(feedback.guestId, {
        attributes: ["id", "email", "eventId"],
      }),
    );

    if (!guest?.email) return;

    await recordLeadEvent({
      email: guest.email,
      eventType: LEAD_EVENT_TYPE.EVENT_FEEDBACK_SUBMITTED,
      occurredAt: feedback.submittedAt || feedback.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.EVENT_FEEDBACK,
      sourceId: feedback.id,
      metadata: {
        eventId: feedback.eventId ?? guest.eventId ?? null,
        guestId: guest.id,
      },
      dedupeKey: `event.feedbackSubmitted:${feedback.id}`,
    });
  };

  if (options.transaction) {
    options.transaction.afterCommit(() => void fire());
    return;
  }

  void fire();
};

export const emitCertificateIssued = (certificate, options = {}) =>
  emitLeadEvent(
    {
      email: certificate.recipientEmail,
      eventType: LEAD_EVENT_TYPE.CERTIFICATE_ISSUED,
      occurredAt: certificate.issuedAt || certificate.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.CERTIFICATES,
      sourceId: certificate.id,
      metadata: {
        eventId: certificate.eventId ?? null,
        certificateNo: certificate.certificateNo ?? null,
      },
      dedupeKey: `certificate.issued:${certificate.id}`,
    },
    options,
  );

/**
 * The free course half of the same event type.
 *
 * Deliberately `CERTIFICATE_ISSUED` rather than a new type: on a lead's
 * timeline "earned a certificate" is the same fact whichever side issued it,
 * and splitting it means every audience filter and every workflow trigger has
 * to remember to check both. The metadata says which course, and the dedupe key
 * is namespaced so an event and a course certificate that happen to share a row
 * id cannot collide.
 */
export const emitFreeCourseCertificateIssued = (certificate, options = {}) =>
  emitLeadEvent(
    {
      email: certificate.recipientEmail,
      eventType: LEAD_EVENT_TYPE.CERTIFICATE_ISSUED,
      occurredAt: certificate.issuedAt || certificate.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.CERTIFICATES,
      sourceId: certificate.id,
      metadata: {
        freeCourseId: certificate.freeCourseId ?? null,
        certificateNo: certificate.certificateNo ?? null,
      },
      dedupeKey: `freeCourse.certificate.issued:${certificate.id}`,
    },
    options,
  );

/* ── resources ──────────────────────────────────────────────────────────── */

export const emitResourceDownloaded = (resourceLead, options = {}) =>
  emitLeadEvent(
    {
      email: resourceLead.email,
      eventType: LEAD_EVENT_TYPE.RESOURCE_DOWNLOADED,
      occurredAt: resourceLead.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.RESOURCE_LEADS,
      sourceId: resourceLead.id,
      metadata: { resourceId: resourceLead.resourceId ?? null },
      dedupeKey: `resource.downloaded:${resourceLead.id}`,
    },
    options,
  );

/* ── recordings ─────────────────────────────────────────────────────────── */

/**
 * Passed a recording's email gate.
 *
 * Called from `afterCreate` only. The gate is re-shown to anybody on a new
 * device, and the controller answers a repeat by updating the existing row —
 * so this fires once per person per recording, which is what makes the
 * timeline entry mean something.
 *
 * `categoryId` rides along in metadata so "everyone who watched an SQL session"
 * is answerable without joining back through `Recordings`.
 */
export const emitRecordingWatched = (recordingLead, options = {}) =>
  emitLeadEvent(
    {
      email: recordingLead.email,
      eventType: LEAD_EVENT_TYPE.RECORDING_WATCHED,
      occurredAt: recordingLead.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.RECORDING_LEADS,
      sourceId: recordingLead.id,
      metadata: {
        recordingId: recordingLead.recordingId ?? null,
        categoryId: recordingLead.recording?.categoryId ?? null,
      },
      dedupeKey: `recording.watched:${recordingLead.id}`,
    },
    options,
  );

/* ── projects ───────────────────────────────────────────────────────────── */

/**
 * Passed a project's download gate.
 *
 * Called from `afterCreate` only. The gate is a client-side unlock and
 * reappears for anybody on a new device, and the controller answers a repeat by
 * updating the existing row — so this fires once per person per project, which
 * is what makes the timeline entry mean something.
 *
 * `categoryId` rides along in metadata so "everyone who downloaded a Python
 * project" is answerable without joining back through `Projects`.
 */
export const emitProjectDownloaded = (projectLead, options = {}) =>
  emitLeadEvent(
    {
      email: projectLead.email,
      eventType: LEAD_EVENT_TYPE.PROJECT_DOWNLOADED,
      occurredAt: projectLead.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.PROJECT_LEADS,
      sourceId: projectLead.id,
      metadata: {
        projectId: projectLead.projectId ?? null,
        categoryId: projectLead.project?.categoryId ?? null,
      },
      dedupeKey: `project.downloaded:${projectLead.id}`,
    },
    options,
  );

/* ── free courses ───────────────────────────────────────────────────────── */

/** Enrolment links through `userId`; the address lives on `users`. */
export const emitFreeCourseEnrolled = (enrolment, options = {}) => {
  const fire = async () => {
    const { User } = await getModels();

    const user = await safely("freeCourseEnrolment → user", () =>
      User.findByPk(enrolment.userId, { attributes: ["id", "email"] }),
    );

    if (!user?.email) return;

    await recordLeadEvent({
      email: user.email,
      eventType: LEAD_EVENT_TYPE.FREE_COURSE_ENROLLED,
      occurredAt: enrolment.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.FREE_COURSE_ENROLMENTS,
      sourceId: enrolment.id,
      metadata: { courseId: enrolment.courseId ?? null },
      dedupeKey: `freeCourse.enrolled:${enrolment.id}`,
    });
  };

  if (options.transaction) {
    options.transaction.afterCommit(() => void fire());
    return;
  }

  void fire();
};

/**
 * Lesson completion, and course completion behind it.
 *
 * Called from the controller rather than an `afterCreate` hook because the
 * progress row is written by `findOrCreate` and *then* updated — the event is
 * the transition to complete, and a row created already-complete and a row
 * completed later must both produce exactly one event. The dedupe key is what
 * guarantees that; the call site only has to not think about it.
 *
 * Fire-and-forget, and it does its own counting. Working out whether the course
 * is now finished is three queries, and none of them belong on the path of the
 * request that marks a lesson done.
 *
 * Course completion is derived, not stored, and it counts **published** lessons
 * only — the same rule `orderedLessonsByCourse` uses for the progress bar. A
 * learner cannot open an unpublished lesson, so counting it would mean nobody
 * ever completes anything.
 */
export const emitLessonCompleted = (progress) => {
  const fire = async () => {
    const { User, FreeCourseLesson, FreeCourseModule } = await getModels();

    const user = await safely("lessonProgress → user", () =>
      User.findByPk(progress.userId, { attributes: ["id", "email"] }),
    );

    if (!user?.email) return;

    // Lessons hang off modules, and only the module knows its course.
    const lesson = await safely("lessonProgress → lesson", () =>
      FreeCourseLesson.findByPk(progress.freeCourseLessonId, {
        attributes: ["id", "freeCourseModuleId"],
      }),
    );

    const module = lesson
      ? await safely("lesson → module", () =>
          FreeCourseModule.findByPk(lesson.freeCourseModuleId, {
            attributes: ["id", "freeCourseId"],
          }),
        )
      : null;

    const courseId = module?.freeCourseId ?? null;

    await recordLeadEvent({
      email: user.email,
      eventType: LEAD_EVENT_TYPE.FREE_COURSE_LESSON_COMPLETED,
      occurredAt: progress.completedAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.FREE_COURSE_PROGRESS,
      sourceId: progress.id,
      metadata: {
        lessonId: progress.freeCourseLessonId ?? null,
        courseId,
      },
      dedupeKey: `freeCourse.lessonCompleted:${progress.id}`,
    });

    if (!courseId) return;

    // Reuses the dashboard's own helpers, so "completed the course" here and
    // a full progress bar there can never disagree.
    const { orderedLessonsByCourse, completedLessonIds } = await import(
      "../freeCourse/lessonProgress.service.js"
    );

    const lessons =
      (await orderedLessonsByCourse([courseId])).get(courseId) ?? [];

    if (!lessons.length) return;

    const completed = await completedLessonIds(
      progress.userId,
      lessons.map((l) => l.id),
    );

    if (completed.size < lessons.length) return;

    await recordLeadEvent({
      email: user.email,
      eventType: LEAD_EVENT_TYPE.FREE_COURSE_COMPLETED,
      occurredAt: progress.completedAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.FREE_COURSE_PROGRESS,
      sourceId: progress.id,
      metadata: { courseId, lessonCount: lessons.length },
      // Keyed on learner + course, not the progress row: finishing a course is
      // one event however many times the last lesson is re-marked.
      dedupeKey: `freeCourse.completed:${progress.userId}:${courseId}`,
    });
  };

  void fire();
};

/* ── meta (facebook) leads ─────────────────────────────────── */

/**
 * A Facebook Lead Ads submission.
 *
 * Called from the `MetaLead` model's afterCreate hook. `meta_leads` is its own
 * table (`FACEBOOK_LEADS_PLAN.md` §2), so unlike every other emitter here this
 * one exists purely because a separate table gets nothing for free — without
 * it, paid social would be invisible to the timeline and to every workflow
 * branch condition.
 *
 * **The event type is `LEAD_CREATED`, not a new `metaLead.created`.** Existing
 * automations keep firing for Facebook leads with no rule changes; anything
 * that needs to tell the channels apart reads `sourceType` or
 * `metadata.channel`. A distinct type would have meant every rule silently
 * ignoring paid social until someone duplicated it.
 *
 * `occurredAt` is Facebook's own timestamp, so a backfilled lead lands at its
 * real position in the timeline rather than clustering on the import date.
 *
 * A lead with no email records nothing — `recordLeadEvent` drops it, because
 * there is no identity to attach the event to. That is most `skipped` rows.
 */
export const emitMetaLeadCreated = (metaLead, options = {}) =>
  emitLeadEvent(
    {
      email: metaLead.email,
      eventType: LEAD_EVENT_TYPE.LEAD_CREATED,
      occurredAt: metaLead.sourceCreatedAt || metaLead.createdAt || new Date(),
      sourceType: LEAD_EVENT_SOURCE_TYPE.META_LEADS,
      sourceId: metaLead.id,
      metadata: {
        channel: "facebook",
        source: metaLead.source ?? null,
        subSource: metaLead.subSource ?? null,
        courseId: metaLead.courseId ?? null,
        status: metaLead.status ?? null,
        formName: metaLead.formName ?? null,
        campaignName: metaLead.campaignName ?? null,
        adsetName: metaLead.adsetName ?? null,
        adName: metaLead.adName ?? null,
      },
      // One meta_leads row is one Facebook submission, so its id is the
      // natural key — same reasoning as the website lead above.
      dedupeKey: `metaLead.created:${metaLead.id}`,
    },
    options,
  );

/* ── subscribers ────────────────────────────────────────────────────────── */

/**
 * Called by the suppression service, which is the single writer of consent
 * state — so this stays consistent with it by construction rather than by
 * anyone remembering to call both.
 *
 * Keyed on the timestamp, not the subscriber id: someone can leave, re-subscribe
 * from the footer, and leave again, and each departure is a real event.
 */
export const emitUnsubscribed = (subscriber, meta = {}) =>
  emitLeadEvent({
    email: subscriber.email,
    eventType: LEAD_EVENT_TYPE.SUBSCRIBER_UNSUBSCRIBED,
    occurredAt: subscriber.unsubscribedAt || new Date(),
    sourceType: LEAD_EVENT_SOURCE_TYPE.SUBSCRIBERS,
    sourceId: subscriber.id,
    metadata: {
      source: meta.source ?? subscriber.source ?? null,
      campaignId: meta.campaignId ?? null,
    },
    dedupeKey: `subscriber.unsubscribed:${subscriber.id}:${(
      subscriber.unsubscribedAt || new Date()
    ).valueOf()}`,
  });
