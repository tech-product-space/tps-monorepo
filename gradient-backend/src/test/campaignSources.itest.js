/**
 * Integration test for phase 6 of the marketing feature — the four deeper
 * audience sources. See ../../MARKETING_CAMPAIGN_PLAN.md §4.4.
 *
 *   node src/test/campaignSources.itest.js
 *
 * No migrations of its own: every table these read already existed.
 *
 * Fixtures are namespaced `zz-sources-itest` and deleted at the end. Imports
 * app.js (not server.js), so no mail can be dispatched.
 */

import { Op } from "sequelize";

import app from "../app.js";
import db from "../database/postgres/models/index.js";
import { generateToken } from "../util/jwt.util.js";
import { buildRecipients } from "../services/campaign/buildRecipients.js";
import {
  RESOLVERS,
  SUPPORTED_SOURCE_TYPES,
} from "../services/campaign/recipientResolver/index.js";
import {
  CAMPAIGN_SOURCE_TYPE,
  FREE_COURSE_PROGRESS_STATE,
} from "../config/constants/campaign.js";
import {
  EVENT_CERTIFICATE_SOURCE,
  EVENT_CERTIFICATE_STATUS,
} from "../config/constants/eventCertificate.js";
import {
  EVENT_ATTENDEE_TYPE,
  EVENT_GUEST_STATUS,
} from "../config/constants/eventGuest.js";
import { USER_STATUS } from "../config/constants/user.js";

const {
  Event,
  EventGuest,
  EventFeedback,
  EventCertificate,
  FreeCourse,
  FreeCourseModule,
  FreeCourseLesson,
  FreeCourseLessonProgress,
  User,
} = db;

const TAG = "zz-sources-itest";
const mail = (n) => `${TAG}-${n}@example.com`;

let pass = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(
    name,
    ok,
    ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const emailsOf = (recipients) => recipients.map((r) => r.email).sort();

const resolveOne = async (type, filters) =>
  (await buildRecipients({ include: [{ type, filters }] })).recipients;

const ids = {};

async function cleanup() {
  await FreeCourseLessonProgress.destroy({
    where: { userId: { [Op.like]: `${TAG}-%` } },
  });
  await EventCertificate.destroy({
    where: { recipientEmail: { [Op.like]: `${TAG}-%` } },
  });
  await EventFeedback.destroy({ where: { guestId: { [Op.like]: `${TAG}-%` } } });
  await EventGuest.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await FreeCourseLesson.destroy({ where: { title: { [Op.like]: `${TAG}%` } } });
  await FreeCourseModule.destroy({ where: { title: { [Op.like]: `${TAG}%` } } });
  await FreeCourse.destroy({ where: { title: { [Op.like]: `${TAG}%` } } });
  await Event.destroy({ where: { eventTitle: { [Op.like]: `${TAG}%` } } });
  await User.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
}

async function seed() {
  /* ── Users. Ids are namespaced so lesson progress can be cleaned up by
        userId without joining. ─────────────────────────────────────────── */
  const users = await User.bulkCreate([
    { id: `${TAG}-u-finisher`, fullName: "Fiona Finisher", email: mail("finisher"), status: USER_STATUS.ACTIVE },
    { id: `${TAG}-u-stalled`, fullName: "Stan Stalled", email: mail("stalled"), status: USER_STATUS.ACTIVE },
    { id: `${TAG}-u-fresh`, fullName: "Fred Fresh", email: mail("fresh"), status: USER_STATUS.ACTIVE },
    { id: `${TAG}-u-blocked`, fullName: "Bea Blocked", email: mail("blocked"), status: USER_STATUS.BLOCKED },
    { id: `${TAG}-u-ref1`, fullName: "Rita Referrer", email: mail("ref1"), status: USER_STATUS.ACTIVE },
    { id: `${TAG}-u-ref2`, fullName: "Ron Onceoff", email: mail("ref2"), status: USER_STATUS.ACTIVE },
  ]);
  ids.userIds = users.map((u) => u.id);

  /* ── A free course: two published lessons and one draft. The draft is the
        point — it must not make the course uncompletable. ───────────────── */
  const course = await FreeCourse.create({
    title: `${TAG}-course`,
    slug: `${TAG}-course-slug`,
  });
  ids.courseId = course.id;

  const module = await FreeCourseModule.create({
    freeCourseId: course.id,
    title: `${TAG}-module`,
    slug: `${TAG}-module-slug`,
  });

  const [lessonA, lessonB, draft] = await FreeCourseLesson.bulkCreate([
    { freeCourseModuleId: module.id, title: `${TAG}-lesson-a`, slug: `${TAG}-l-a`, isPublished: true },
    { freeCourseModuleId: module.id, title: `${TAG}-lesson-b`, slug: `${TAG}-l-b`, isPublished: true },
    { freeCourseModuleId: module.id, title: `${TAG}-lesson-draft`, slug: `${TAG}-l-d`, isPublished: false },
  ]);
  ids.lessonIds = [lessonA.id, lessonB.id, draft.id];

  const old = new Date("2020-01-01T00:00:00Z");

  await FreeCourseLessonProgress.bulkCreate([
    // Finished both published lessons.
    { userId: `${TAG}-u-finisher`, freeCourseLessonId: lessonA.id, completed: true },
    { userId: `${TAG}-u-finisher`, freeCourseLessonId: lessonB.id, completed: true },
    // One done, one open, and no activity since 2020 — the stalled segment.
    { userId: `${TAG}-u-stalled`, freeCourseLessonId: lessonA.id, completed: true, createdAt: old, updatedAt: old },
    { userId: `${TAG}-u-stalled`, freeCourseLessonId: lessonB.id, completed: false, createdAt: old, updatedAt: old },
    // Started today: in progress, but not stalled.
    { userId: `${TAG}-u-fresh`, freeCourseLessonId: lessonA.id, completed: false },
    // Blocked accounts must never resolve, however much progress they have.
    { userId: `${TAG}-u-blocked`, freeCourseLessonId: lessonA.id, completed: true },
    { userId: `${TAG}-u-blocked`, freeCourseLessonId: lessonB.id, completed: true },
  ], { silent: true });

  /* ── An event with four guests. ───────────────────────────────────────── */
  const event = await Event.create({
    eventTitle: `${TAG}-event`,
    eventType: "Workshop",
    eventCategory: "Normal",
    eventSlug: `${TAG}-event-slug`,
  });
  ids.eventId = event.id;

  const otherEvent = await Event.create({
    eventTitle: `${TAG}-event-2`,
    eventType: "Workshop",
    eventCategory: "Normal",
    eventSlug: `${TAG}-event-2-slug`,
  });
  ids.otherEventId = otherEvent.id;

  const guests = await EventGuest.bulkCreate([
    { eventId: event.id, name: `${TAG}-responder`, email: mail("responder"), phone: "1", status: EVENT_GUEST_STATUS.APPROVED, attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL, referrerUserId: `${TAG}-u-ref1` },
    { eventId: event.id, name: `${TAG}-silent`, email: mail("silent"), phone: "2", status: EVENT_GUEST_STATUS.APPROVED, attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL, referrerUserId: `${TAG}-u-ref1` },
    { eventId: event.id, name: `${TAG}-waitlisted`, email: mail("waitlisted"), phone: "3", status: EVENT_GUEST_STATUS.WAITLISTED, attendeeType: EVENT_ATTENDEE_TYPE.STUDENT, referrerUserId: `${TAG}-u-ref2` },
    // No email at all — EventGuest.email is nullable, so the guard matters.
    { eventId: event.id, name: `${TAG}-nomail`, email: null, phone: "4", status: EVENT_GUEST_STATUS.APPROVED, attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL },
    // A second event, so per-event filtering is actually exercised.
    { eventId: otherEvent.id, name: `${TAG}-other`, email: mail("other"), phone: "5", status: EVENT_GUEST_STATUS.APPROVED, attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL, referrerUserId: `${TAG}-u-ref1` },
  ]);

  ids.responderGuestId = guests[0].id;

  await EventFeedback.create({
    eventId: event.id,
    guestId: guests[0].id,
    responses: { rating: 5 },
    submittedAt: new Date(),
  });

  /* ── Certificates: issued, revoked, pending, and a teammate. ──────────── */
  await EventCertificate.bulkCreate([
    { eventId: event.id, certificateNo: `${TAG}-C1`, recipientName: "Cert One", recipientEmail: mail("cert1"), source: EVENT_CERTIFICATE_SOURCE.ATTENDEE, status: EVENT_CERTIFICATE_STATUS.ISSUED },
    { eventId: event.id, certificateNo: `${TAG}-C2`, recipientName: "Cert Team", recipientEmail: mail("cert-team"), source: EVENT_CERTIFICATE_SOURCE.TEAMMATE, status: EVENT_CERTIFICATE_STATUS.ISSUED },
    { eventId: event.id, certificateNo: `${TAG}-C3`, recipientName: "Cert Revoked", recipientEmail: mail("cert-revoked"), source: EVENT_CERTIFICATE_SOURCE.ATTENDEE, status: EVENT_CERTIFICATE_STATUS.REVOKED },
    { eventId: event.id, certificateNo: `${TAG}-C4`, recipientName: "Cert Pending", recipientEmail: mail("cert-pending"), source: EVENT_CERTIFICATE_SOURCE.ATTENDEE, status: EVENT_CERTIFICATE_STATUS.PENDING },
    { eventId: otherEvent.id, certificateNo: `${TAG}-C5`, recipientName: "Cert Other", recipientEmail: mail("cert-other"), source: EVENT_CERTIFICATE_SOURCE.ATTENDEE, status: EVENT_CERTIFICATE_STATUS.ISSUED },
  ]);
}

const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const BASE = `http://127.0.0.1:${server.address().port}`;

const adminToken = generateToken({
  id: "itest-admin",
  role: "Super Admin",
  name: "ITest",
  email: "itest@example.com",
});

const api = (path) =>
  fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
  });

try {
  await cleanup();
  await seed();

  /* ═══════════════════════════════════════════════════════════════════════
     Registry
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== registry ===\n");

  eq("twelve sources are supported", SUPPORTED_SOURCE_TYPES.length, 12);
  eq(
    "the registry matches the vocabulary exactly",
    [...SUPPORTED_SOURCE_TYPES].sort(),
    Object.values(CAMPAIGN_SOURCE_TYPE).sort(),
  );
  check(
    "every entry is a function",
    Object.values(RESOLVERS).every((r) => typeof r === "function"),
  );

  /* ═══════════════════════════════════════════════════════════════════════
     certificateHolders
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== certificateHolders ===\n");

  {
    const r = await resolveOne("certificateHolders", { eventId: [ids.eventId] });

    eq("defaults to issued only", emailsOf(r), [mail("cert-team"), mail("cert1")].sort());
    check(
      "revoked is never included by default",
      !emailsOf(r).includes(mail("cert-revoked")),
    );
    check(
      "pending is not a certificate holder",
      !emailsOf(r).includes(mail("cert-pending")),
    );
    eq("tagged with the source", r[0].sourceType, "certificateHolders");
    check("carries the recipient name", Boolean(r[0].name));
  }

  {
    const r = await resolveOne("certificateHolders", {
      eventId: [ids.eventId],
      source: [EVENT_CERTIFICATE_SOURCE.ATTENDEE],
    });
    eq("attendees only excludes teammates", emailsOf(r), [mail("cert1")]);
  }

  {
    const r = await resolveOne("certificateHolders", {
      eventId: [ids.eventId],
      source: [EVENT_CERTIFICATE_SOURCE.TEAMMATE],
    });
    eq("teammates are their own audience", emailsOf(r), [mail("cert-team")]);
  }

  {
    const r = await resolveOne("certificateHolders", {
      eventId: [ids.eventId],
      status: [EVENT_CERTIFICATE_STATUS.REVOKED],
    });
    eq("status is overridable", emailsOf(r), [mail("cert-revoked")]);
  }

  {
    // Unlike eventGuests, no event means every certificate — "all our alumni"
    // is a coherent audience.
    const r = await resolveOne("certificateHolders", {});
    const mine = emailsOf(r).filter((e) => e.startsWith(TAG));
    eq("no event selected means all certificates", mine, [
      mail("cert-other"),
      mail("cert-team"),
      mail("cert1"),
    ].sort());
  }

  {
    const r = await resolveOne("certificateHolders", {
      eventId: [ids.eventId],
      createdFrom: "2999-01-01",
    });
    eq("a future date range matches nobody", r.length, 0);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     eventFeedback
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== eventFeedback ===\n");

  {
    const r = await resolveOne("eventFeedback", { eventId: [ids.eventId] });
    eq("defaults to responders", emailsOf(r), [mail("responder")]);
  }

  {
    // The nudge. This is the assertion that would catch Sequelize compiling the
    // null check into the JOIN's ON clause — that bug returns every guest.
    const r = await resolveOne("eventFeedback", {
      eventId: [ids.eventId],
      responded: false,
    });

    eq("non-responders exclude the one who answered", emailsOf(r), [
      mail("silent"),
      mail("waitlisted"),
    ].sort());
    check(
      "the responder is genuinely absent",
      !emailsOf(r).includes(mail("responder")),
    );
    check(
      "a guest with no email address is skipped",
      r.every((x) => Boolean(x.email)),
    );
  }

  {
    const r = await resolveOne("eventFeedback", {
      eventId: [ids.eventId],
      responded: false,
      status: [EVENT_GUEST_STATUS.APPROVED],
    });
    eq(
      "status narrows the nudge to people who could actually attend",
      emailsOf(r),
      [mail("silent")],
    );
  }

  {
    const r = await resolveOne("eventFeedback", { eventId: [ids.otherEventId] });
    eq("another event's feedback is separate", r.length, 0);
  }

  {
    const r = await resolveOne("eventFeedback", {});
    eq("no event selected resolves to nobody", r.length, 0);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     eventReferrers
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== eventReferrers ===\n");

  {
    const r = await resolveOne("eventReferrers", {});
    const mine = emailsOf(r).filter((e) => e.startsWith(TAG));
    eq("everyone who referred anybody", mine, [mail("ref1"), mail("ref2")].sort());
    check("one row per referrer, not per referral", new Set(mine).size === mine.length);
  }

  {
    // rita referred two people to one event and one to another → 3.
    const r = await resolveOne("eventReferrers", { minReferrals: 3 });
    const mine = emailsOf(r).filter((e) => e.startsWith(TAG));
    eq("minReferrals ranks by count", mine, [mail("ref1")]);
  }

  {
    const r = await resolveOne("eventReferrers", { minReferrals: 99 });
    const mine = emailsOf(r).filter((e) => e.startsWith(TAG));
    eq("an unreachable threshold matches nobody", mine, []);
  }

  {
    const r = await resolveOne("eventReferrers", { eventId: [ids.otherEventId] });
    const mine = emailsOf(r).filter((e) => e.startsWith(TAG));
    eq("scoped to one event", mine, [mail("ref1")]);
  }

  {
    const r = await resolveOne("eventReferrers", {
      eventId: [ids.otherEventId],
      minReferrals: 2,
    });
    const mine = emailsOf(r).filter((e) => e.startsWith(TAG));
    eq("the count is scoped to the event too", mine, []);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     freeCourseProgress
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== freeCourseProgress ===\n");

  {
    const r = await resolveOne("freeCourseProgress", {
      freeCourseId: [ids.courseId],
    });
    eq("any progress at all", emailsOf(r), [
      mail("finisher"),
      mail("fresh"),
      mail("stalled"),
    ].sort());
    check(
      "a blocked account never resolves",
      !emailsOf(r).includes(mail("blocked")),
    );
  }

  {
    // The draft lesson must not count in the denominator — if it did, nobody
    // could ever complete a course with unpublished work in it.
    const r = await resolveOne("freeCourseProgress", {
      freeCourseId: [ids.courseId],
      state: FREE_COURSE_PROGRESS_STATE.COMPLETED,
    });
    eq("completed means every published lesson", emailsOf(r), [mail("finisher")]);
  }

  {
    const r = await resolveOne("freeCourseProgress", {
      freeCourseId: [ids.courseId],
      state: FREE_COURSE_PROGRESS_STATE.IN_PROGRESS,
    });
    eq("in progress excludes the finisher", emailsOf(r), [
      mail("fresh"),
      mail("stalled"),
    ].sort());
  }

  {
    // This is the segment worth having: unfinished *and* untouched for a while.
    const r = await resolveOne("freeCourseProgress", {
      freeCourseId: [ids.courseId],
      state: FREE_COURSE_PROGRESS_STATE.IN_PROGRESS,
      lastActivityBefore: "2021-01-01",
    });
    eq("stalled is in-progress plus a cutoff", emailsOf(r), [mail("stalled")]);
  }

  {
    const r = await resolveOne("freeCourseProgress", {
      freeCourseId: [ids.courseId],
      state: "nonsense",
    });
    eq("an unknown state falls back to any", emailsOf(r).length, 3);
  }

  {
    const r = await resolveOne("freeCourseProgress", {});
    eq("no course selected resolves to nobody", r.length, 0);
  }

  {
    // A published lesson added to the course moves the finisher back to
    // in-progress. They have not done the new one.
    const extra = await FreeCourseLesson.create({
      freeCourseModuleId: (
        await FreeCourseModule.findOne({ where: { freeCourseId: ids.courseId } })
      ).id,
      title: `${TAG}-lesson-c`,
      slug: `${TAG}-l-c`,
      isPublished: true,
    });

    const r = await resolveOne("freeCourseProgress", {
      freeCourseId: [ids.courseId],
      state: FREE_COURSE_PROGRESS_STATE.COMPLETED,
    });
    eq("adding a lesson un-completes the course", r.length, 0);

    await extra.destroy();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Include / exclude and the sources endpoint
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== integration ===\n");

  {
    // The segment phase 6 exists for: certified alumni who have not finished
    // the free course.
    const { recipients } = await buildRecipients({
      include: [
        { type: "freeCourseProgress", filters: { freeCourseId: [ids.courseId] } },
      ],
      exclude: [
        {
          type: "freeCourseProgress",
          filters: {
            freeCourseId: [ids.courseId],
            state: FREE_COURSE_PROGRESS_STATE.COMPLETED,
          },
        },
      ],
    });

    eq("a new source works on both sides of the algebra", emailsOf(recipients), [
      mail("fresh"),
      mail("stalled"),
    ].sort());
  }

  {
    const body = await (await api("/campaigns/sources")).json();
    const advertised = body.data?.supportedSourceTypes || [];

    eq("the sources endpoint advertises all twelve", advertised.length, 12);
    for (const type of [
      "certificateHolders",
      "freeCourseProgress",
      "eventFeedback",
      "eventReferrers",
    ]) {
      check(`  ...including ${type}`, advertised.includes(type));
    }

    check(
      "certificate statuses are shipped for the picker",
      body.data?.certificates?.statuses?.includes(EVENT_CERTIFICATE_STATUS.ISSUED),
    );
    check(
      "certificate sources too",
      body.data?.certificates?.sources?.includes(EVENT_CERTIFICATE_SOURCE.TEAMMATE),
    );
    check(
      "progress states too",
      body.data?.freeCourseProgress?.states?.includes("completed"),
    );
  }

  {
    // The pickers show sizes next to every name. Picking "March workshop" with
    // no idea whether that is 40 people or 4,000 is not a decision anyone can
    // make, so these counts are part of the contract, not decoration.
    const body = await (await api("/campaigns/sources")).json();

    const event = body.data?.events?.items?.find((e) => e.id === ids.eventId);

    // Four guests seeded on this event, one with no email address.
    eq("event guest counts exclude unmailable guests", event?.totalGuests, 3);
    eq(
      "  ...and break down by status",
      event?.guestsByStatus?.[EVENT_GUEST_STATUS.APPROVED],
      2,
    );
    eq(
      "  ...including waitlisted",
      event?.guestsByStatus?.[EVENT_GUEST_STATUS.WAITLISTED],
      1,
    );

    const quiet = body.data?.events?.items?.find(
      (e) => e.id === ids.otherEventId,
    );
    eq("an event with one guest reports one", quiet?.totalGuests, 1);

    // Every event carries the fields even with no guests at all — the picker
    // renders them unconditionally, so a missing key would be a crash.
    check(
      "every event carries both count fields",
      body.data.events.items.every(
        (e) =>
          typeof e.totalGuests === "number" &&
          e.guestsByStatus !== null &&
          typeof e.guestsByStatus === "object",
      ),
    );

    check(
      "every resource carries downloads and people",
      body.data.resources.items.every(
        (r) => typeof r.downloads === "number" && typeof r.people === "number",
      ),
    );

    check(
      "downloads are never fewer than people",
      body.data.resources.items.every((r) => r.downloads >= r.people),
    );
  }
} finally {
  await cleanup();

  const leftover =
    (await User.count({ where: { email: { [Op.like]: `${TAG}-%` } } })) +
    (await EventGuest.count({ where: { name: { [Op.like]: `${TAG}%` } } })) +
    (await EventCertificate.count({ where: { recipientEmail: { [Op.like]: `${TAG}-%` } } })) +
    (await Event.count({ where: { eventTitle: { [Op.like]: `${TAG}%` } } })) +
    (await FreeCourse.count({ where: { title: { [Op.like]: `${TAG}%` } } }));

  console.log(`\nfixtures left behind: ${leftover}`);

  server.closeAllConnections?.();
  server.close();
  await db.sequelize.close();

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}
