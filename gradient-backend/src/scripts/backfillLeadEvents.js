/**
 * Backfills `lead_events` from the tables that already hold the history.
 *
 *   node src/scripts/backfillLeadEvents.js            # everything
 *   node src/scripts/backfillLeadEvents.js leads      # one source
 *   node src/scripts/backfillLeadEvents.js --dry-run
 *
 * **Idempotent.** Every event carries the same `dedupeKey` the live emitter
 * would have written, so running this twice adds nothing the second time, and
 * running it against a database that has been recording live for a week fills
 * in only what predates the emitters. That is the property that makes it safe
 * to re-run when it fails halfway, which is what a backfill over a large table
 * eventually does.
 *
 * `occurredAt` comes from the source row's own timestamp, never from now —
 * a timeline where everything happened the afternoon of the migration is not
 * a timeline.
 *
 * The one thing it cannot reconstruct is **course completion**: nothing records
 * when the last lesson landed, only that each lesson is done. Completion is
 * derived per learner-course at the end, timestamped with the latest lesson
 * completion, which is the honest approximation.
 */

import "dotenv/config";

import { Op } from "sequelize";

import db from "../database/postgres/models/index.js";
import {
  LEAD_EVENT_TYPE,
  LEAD_EVENT_SOURCE_TYPE,
} from "../config/constants/leadEvent.js";
import { EVENT_CERTIFICATE_STATUS } from "../config/constants/eventCertificate.js";
import { SUBSCRIBER_STATUS } from "../config/constants/subscriber.js";
import { recordLeadEvent } from "../services/leadEvent/recordLeadEvent.service.js";

const {
  Lead,
  EventGuest,
  EventFeedback,
  ResourceLead,
  FreeCourseEnrollment,
  FreeCourseLessonProgress,
  EventCertificate,
  Subscriber,
  User,
  FreeCourseLesson,
  FreeCourseModule,
} = db;

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/** Rows per page. Large enough to be quick, small enough to stay in memory. */
const PAGE = 500;

const stats = {};

const bump = (key, field) => {
  stats[key] ??= { written: 0, skipped: 0, noEmail: 0 };
  stats[key][field] += 1;
};

/**
 * Writes one event, or counts why it did not.
 *
 * `recordLeadEvent` returns null for a duplicate and for a missing email alike,
 * so the caller distinguishes them — a run that reports "40,000 skipped" should
 * say whether that is "already done" or "no address to attach it to".
 */
const write = async (key, input) => {
  if (!input.email) {
    bump(key, "noEmail");
    return;
  }

  if (DRY_RUN) {
    bump(key, "written");
    return;
  }

  const row = await recordLeadEvent(input);
  bump(key, row ? "written" : "skipped");
};

/** Pages a table by primary key, so a long run cannot skip or repeat rows. */
const eachRow = async (model, options, fn) => {
  let after = null;

  for (;;) {
    const where = { ...(options.where || {}) };
    if (after) where.id = { [Op.gt]: after };

    const rows = await model.findAll({
      ...options,
      where,
      order: [["id", "ASC"]],
      limit: PAGE,
    });

    if (!rows.length) return;

    for (const row of rows) await fn(row);

    after = rows[rows.length - 1].id;
  }
};

/** email by user id, for the two free-course tables that store neither. */
const loadUserEmails = async () => {
  const users = await User.findAll({ attributes: ["id", "email"] });
  return new Map(users.map((u) => [u.id, u.email]));
};

/* ── sources ────────────────────────────────────────────────────────────── */

const backfillLeads = () =>
  eachRow(Lead, { attributes: ["id", "email", "source", "subSource", "courseId", "status", "createdAt"] }, (lead) =>
    write("leads", {
      email: lead.email,
      eventType: LEAD_EVENT_TYPE.LEAD_CREATED,
      occurredAt: lead.createdAt,
      sourceType: LEAD_EVENT_SOURCE_TYPE.LEADS,
      sourceId: lead.id,
      metadata: {
        source: lead.source ?? null,
        subSource: lead.subSource ?? null,
        courseId: lead.courseId ?? null,
        status: lead.status ?? null,
      },
      dedupeKey: `lead.created:${lead.id}`,
    }),
  );

const backfillEventGuests = () =>
  eachRow(EventGuest, { attributes: ["id", "email", "eventId", "status", "attendeeType", "createdAt"] }, (guest) =>
    write("eventGuests", {
      email: guest.email,
      eventType: LEAD_EVENT_TYPE.EVENT_REGISTERED,
      occurredAt: guest.createdAt,
      sourceType: LEAD_EVENT_SOURCE_TYPE.EVENT_GUESTS,
      sourceId: guest.id,
      metadata: {
        eventId: guest.eventId ?? null,
        status: guest.status ?? null,
        attendeeType: guest.attendeeType ?? null,
      },
      dedupeKey: `event.registered:${guest.id}`,
    }),
  );

const backfillEventFeedback = async () => {
  // One pass over guests rather than a per-feedback lookup: feedback carries no
  // email, and joining row by row would be a query per submission.
  const guests = await EventGuest.findAll({ attributes: ["id", "email", "eventId"] });
  const byGuest = new Map(guests.map((g) => [g.id, g]));

  return eachRow(EventFeedback, { attributes: ["id", "guestId", "eventId", "submittedAt", "createdAt"] }, (fb) => {
    const guest = byGuest.get(fb.guestId);

    return write("eventFeedback", {
      email: guest?.email,
      eventType: LEAD_EVENT_TYPE.EVENT_FEEDBACK_SUBMITTED,
      occurredAt: fb.submittedAt || fb.createdAt,
      sourceType: LEAD_EVENT_SOURCE_TYPE.EVENT_FEEDBACK,
      sourceId: fb.id,
      metadata: {
        eventId: fb.eventId ?? guest?.eventId ?? null,
        guestId: fb.guestId,
      },
      dedupeKey: `event.feedbackSubmitted:${fb.id}`,
    });
  });
};

const backfillResourceLeads = () =>
  eachRow(ResourceLead, { attributes: ["id", "email", "resourceId", "createdAt"] }, (row) =>
    write("resourceLeads", {
      email: row.email,
      eventType: LEAD_EVENT_TYPE.RESOURCE_DOWNLOADED,
      occurredAt: row.createdAt,
      sourceType: LEAD_EVENT_SOURCE_TYPE.RESOURCE_LEADS,
      sourceId: row.id,
      metadata: { resourceId: row.resourceId ?? null },
      dedupeKey: `resource.downloaded:${row.id}`,
    }),
  );

const backfillCertificates = () =>
  eachRow(
    EventCertificate,
    {
      // Only the ones that actually exist as a PDF. Pending and Failed rows are
      // not certificates anybody earned, and putting them on a timeline would
      // claim otherwise.
      where: { status: EVENT_CERTIFICATE_STATUS.ISSUED },
      attributes: ["id", "recipientEmail", "eventId", "certificateNo", "issuedAt", "createdAt"],
    },
    (cert) =>
      write("certificates", {
        email: cert.recipientEmail,
        eventType: LEAD_EVENT_TYPE.CERTIFICATE_ISSUED,
        occurredAt: cert.issuedAt || cert.createdAt,
        sourceType: LEAD_EVENT_SOURCE_TYPE.CERTIFICATES,
        sourceId: cert.id,
        metadata: {
          eventId: cert.eventId ?? null,
          certificateNo: cert.certificateNo ?? null,
        },
        dedupeKey: `certificate.issued:${cert.id}`,
      }),
  );

const backfillFreeCourseEnrolments = async () => {
  const emails = await loadUserEmails();

  return eachRow(FreeCourseEnrollment, { attributes: ["id", "userId", "courseId", "createdAt"] }, (row) =>
    write("freeCourseEnrolments", {
      email: emails.get(row.userId),
      eventType: LEAD_EVENT_TYPE.FREE_COURSE_ENROLLED,
      occurredAt: row.createdAt,
      sourceType: LEAD_EVENT_SOURCE_TYPE.FREE_COURSE_ENROLMENTS,
      sourceId: row.id,
      metadata: { courseId: row.courseId ?? null },
      dedupeKey: `freeCourse.enrolled:${row.id}`,
    }),
  );
};

/**
 * Lesson completions, and the course completions derived from them.
 *
 * The lesson → module → course map is loaded once. Doing it per row would be
 * two queries per completed lesson, which on any real dataset is the difference
 * between a minute and an afternoon.
 */
const backfillLessonProgress = async () => {
  const emails = await loadUserEmails();

  const [lessons, modules] = await Promise.all([
    FreeCourseLesson.findAll({ attributes: ["id", "freeCourseModuleId", "isPublished"] }),
    FreeCourseModule.findAll({ attributes: ["id", "freeCourseId", "isPublished"] }),
  ]);

  const moduleCourse = new Map(
    modules.filter((m) => m.isPublished).map((m) => [m.id, m.freeCourseId]),
  );

  // Published lessons only, matching `orderedLessonsByCourse` — the count a
  // learner can actually reach.
  const lessonCourse = new Map();
  const courseLessonCount = new Map();

  for (const lesson of lessons) {
    if (!lesson.isPublished) continue;

    const courseId = moduleCourse.get(lesson.freeCourseModuleId);
    if (!courseId) continue;

    lessonCourse.set(lesson.id, courseId);
    courseLessonCount.set(courseId, (courseLessonCount.get(courseId) ?? 0) + 1);
  }

  // learner+course -> { done, latest }
  const progressByPair = new Map();

  await eachRow(
    FreeCourseLessonProgress,
    {
      where: { completed: true },
      attributes: ["id", "userId", "freeCourseLessonId", "completedAt", "createdAt"],
    },
    async (row) => {
      const courseId = lessonCourse.get(row.freeCourseLessonId) ?? null;
      const occurredAt = row.completedAt || row.createdAt;

      await write("freeCourseProgress", {
        email: emails.get(row.userId),
        eventType: LEAD_EVENT_TYPE.FREE_COURSE_LESSON_COMPLETED,
        occurredAt,
        sourceType: LEAD_EVENT_SOURCE_TYPE.FREE_COURSE_PROGRESS,
        sourceId: row.id,
        metadata: { lessonId: row.freeCourseLessonId, courseId },
        dedupeKey: `freeCourse.lessonCompleted:${row.id}`,
      });

      if (!courseId) return;

      const key = `${row.userId}:${courseId}`;
      const seen = progressByPair.get(key) ?? { done: 0, latest: occurredAt, progressId: row.id };

      seen.done += 1;
      if (occurredAt > seen.latest) {
        seen.latest = occurredAt;
        seen.progressId = row.id;
      }

      progressByPair.set(key, seen);
    },
  );

  for (const [key, seen] of progressByPair) {
    const [userId, courseId] = key.split(":");
    const total = courseLessonCount.get(courseId) ?? 0;

    if (!total || seen.done < total) continue;

    await write("freeCourseCompleted", {
      email: emails.get(userId),
      eventType: LEAD_EVENT_TYPE.FREE_COURSE_COMPLETED,
      // The best timestamp available: nothing records when a course was
      // finished, only when each lesson was, so the last lesson stands in.
      occurredAt: seen.latest,
      sourceType: LEAD_EVENT_SOURCE_TYPE.FREE_COURSE_PROGRESS,
      sourceId: seen.progressId,
      metadata: { courseId, lessonCount: total },
      dedupeKey: `freeCourse.completed:${userId}:${courseId}`,
    });
  }
};

const backfillUnsubscribes = () =>
  eachRow(
    Subscriber,
    {
      where: { status: SUBSCRIBER_STATUS.UNSUBSCRIBED },
      attributes: ["id", "email", "source", "unsubscribedAt", "unsubscribedFromCampaignId", "updatedAt"],
    },
    (sub) => {
      const at = sub.unsubscribedAt || sub.updatedAt;

      return write("subscribers", {
        email: sub.email,
        eventType: LEAD_EVENT_TYPE.SUBSCRIBER_UNSUBSCRIBED,
        occurredAt: at,
        sourceType: LEAD_EVENT_SOURCE_TYPE.SUBSCRIBERS,
        sourceId: sub.id,
        metadata: {
          source: sub.source ?? null,
          campaignId: sub.unsubscribedFromCampaignId ?? null,
        },
        // Matches the live emitter's key exactly, so a row unsubscribed after
        // the emitters shipped is not written twice.
        dedupeKey: `subscriber.unsubscribed:${sub.id}:${new Date(at).valueOf()}`,
      });
    },
  );

/* ── run ────────────────────────────────────────────────────────────────── */

const SOURCES = {
  leads: backfillLeads,
  eventGuests: backfillEventGuests,
  eventFeedback: backfillEventFeedback,
  resourceLeads: backfillResourceLeads,
  certificates: backfillCertificates,
  freeCourseEnrolments: backfillFreeCourseEnrolments,
  freeCourseProgress: backfillLessonProgress,
  subscribers: backfillUnsubscribes,
};

const main = async () => {
  const chosen = ONLY.length ? ONLY : Object.keys(SOURCES);

  for (const name of chosen) {
    const fn = SOURCES[name];

    if (!fn) {
      // Named rather than ignored, for the same reason an unknown campaign
      // source type is an error: a typo that silently backfills nothing looks
      // exactly like a table that was already done.
      console.error(`Unknown source: ${name}`);
      console.error(`Known: ${Object.keys(SOURCES).join(", ")}`);
      process.exit(1);
    }

    const started = Date.now();
    console.log(`\n→ ${name}${DRY_RUN ? " (dry run)" : ""}`);

    await fn();

    const s = stats[name] ?? { written: 0, skipped: 0, noEmail: 0 };
    console.log(
      `  ${s.written} written · ${s.skipped} already present · ${s.noEmail} without an email` +
        `  (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
  }

  const totals = Object.values(stats).reduce(
    (acc, s) => ({
      written: acc.written + s.written,
      skipped: acc.skipped + s.skipped,
      noEmail: acc.noEmail + s.noEmail,
    }),
    { written: 0, skipped: 0, noEmail: 0 },
  );

  console.log(
    `\n${DRY_RUN ? "Would write" : "Wrote"} ${totals.written} events · ` +
      `${totals.skipped} already present · ${totals.noEmail} without an email`,
  );

  await db.sequelize.close();
};

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
