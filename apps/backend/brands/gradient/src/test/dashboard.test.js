/**
 * Manual script — `node src/test/dashboard.test.js`
 *
 * Exercises the three dashboard resolvers against the real database:
 *
 *   resolveMyEvents · resolveMyCourses · resolveMyCertificates
 *
 * Builds its own user, event, guests, feedback, certificate, course, modules,
 * lessons and progress rows, then removes all of them.
 *
 * The cases that matter and are easy to get wrong:
 *   - a guest row with a null userId, matched only by email
 *   - a certificate with a null guestId, issued to a teammate before they
 *     ever had an account
 *   - a team submission by *someone else*, which must read as "submitted"
 *   - unpublished lessons excluded from both the total and the next lesson
 */
import db from "../database/postgres/models/index.js";

import { resolveMyEvents } from "../services/dashboard/myEvents.service.js";
import { resolveMyCourses } from "../services/dashboard/myCourses.service.js";
import { resolveMyCertificates } from "../services/dashboard/myCertificates.service.js";
import { EVENT_GUEST_STATUS } from "../config/constants/eventGuest.js";
import {
  EVENT_CERTIFICATE_APPROVED_VIA,
  EVENT_CERTIFICATE_STATUS,
} from "../config/constants/eventCertificate.js";

const {
  User,
  Event,
  EventGuest,
  EventFeedback,
  EventCertificate,
  FreeCourse,
  FreeCourseModule,
  FreeCourseLesson,
  FreeCourseLessonProgress,
  FreeCourseEnrollment,
} = db;

let passed = 0;
let failed = 0;

const ok = (label, condition, detail = "") => {
  condition ? passed++ : failed++;
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

// Event dates are STRING columns, not DATE — they hold "YYYY-MM-DD".
const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const run = async () => {
  const stamp = Date.now();
  const email = `dash-${stamp}@example.com`;

  const user = await User.create({
    fullName: "Priya Nair",
    email,
    phone: "9999911111",
    status: "active",
  });

  const created = { events: [], courses: [] };

  try {
    // ── Event A: past, feedback open, they submitted, certificate issued ────
    const past = await Event.create({
      eventTitle: `Dash Past ${stamp}`,
      eventSlug: `dash-past-${stamp}`,
      eventType: "Hackathon",
      eventCategory: "Normal",
      canAcceptResponse: true,
      eventStartDate: daysFromNow(-30),
      eventEndDate: daysFromNow(-30),
    });
    created.events.push(past);

    // No userId — registered by email before they had an account. This is the
    // row a userId-only match would miss.
    const pastGuest = await EventGuest.create({
      eventId: past.id,
      name: "Priya Nair",
      email,
      phone: "9999911111",
      attendeeType: "Professional",
      role: "PM",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    await EventFeedback.create({
      eventId: past.id,
      guestId: pastGuest.id,
      responses: { teamName: "Nova", demoVideoUrl: "https://youtu.be/x" },
      submittedAt: new Date(),
    });

    // guestId null — the shape a teammate's certificate has.
    await EventCertificate.create({
      eventId: past.id,
      guestId: null,
      certificateNo: `GRD-2026-DSH${String(stamp).slice(-5)}`,
      recipientName: "Priya Nair",
      recipientEmail: email,
      source: "Teammate",
      status: EVENT_CERTIFICATE_STATUS.ISSUED,
      approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.AUTO,
      issuedAt: new Date(),
      fileKey: `certificates/${past.id}/test.pdf`,
    });

    // ── Event B: upcoming, linked by userId, nothing submitted ─────────────
    const upcoming = await Event.create({
      eventTitle: `Dash Upcoming ${stamp}`,
      eventSlug: `dash-upcoming-${stamp}`,
      eventType: "Workshop",
      eventCategory: "Normal",
      canAcceptResponse: true,
      eventStartDate: daysFromNow(14),
      eventEndDate: daysFromNow(14),
    });
    created.events.push(upcoming);

    await EventGuest.create({
      eventId: upcoming.id,
      userId: user.id,
      isAccountLinked: true,
      name: "Priya Nair",
      email,
      phone: "9999911111",
      attendeeType: "Professional",
      role: "PM",
      status: EVENT_GUEST_STATUS.WAITLISTED,
    });

    // ── Event C: a teammate submitted on her behalf ────────────────────────
    const team = await Event.create({
      eventTitle: `Dash Team ${stamp}`,
      eventSlug: `dash-team-${stamp}`,
      eventType: "Teardown",
      eventCategory: "Normal",
      canAcceptResponse: true,
      eventStartDate: daysFromNow(-10),
      eventEndDate: daysFromNow(-10),
    });
    created.events.push(team);

    await EventGuest.create({
      eventId: team.id,
      userId: user.id,
      name: "Priya Nair",
      email,
      phone: "9999911111",
      attendeeType: "Professional",
      role: "PM",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    const teammate = await EventGuest.create({
      eventId: team.id,
      name: "Rahul Verma",
      email: `rahul-${stamp}@example.com`,
      phone: "9999922222",
      attendeeType: "Professional",
      role: "PM",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    await EventFeedback.create({
      eventId: team.id,
      guestId: teammate.id,
      responses: {
        teamName: "Atlas",
        submissionUrl: "https://example.com/deck",
        teamMembers: [{ name: "Priya Nair", email }],
      },
      submittedAt: new Date(),
    });

    console.log("\n1. My events");
    const events = await resolveMyEvents({ userId: user.id, email });

    ok("all three events found", events.length === 3, `${events.length} found`);
    ok(
      "the email-only guest row is included",
      events.some((item) => item.event.eventSlug === `dash-past-${stamp}`),
    );
    ok(
      "upcoming sorts above past",
      events[0].event.eventSlug === `dash-upcoming-${stamp}`,
      events.map((e) => e.event.eventSlug.split("-")[1]).join(" → "),
    );

    const pastCard = events.find((e) => e.event.eventSlug === `dash-past-${stamp}`);
    ok("own submission reads as self", pastCard.feedback.submitted === "self");
    ok("certificate attached despite a null guestId", pastCard.certificate?.ready === true);

    const teamCard = events.find((e) => e.event.eventSlug === `dash-team-${stamp}`);
    ok("a teammate's submission reads as team", teamCard.feedback.submitted === "team");
    ok("and credits who sent it", teamCard.feedback.submittedBy === "Rahul Verma");

    const upcomingCard = events.find(
      (e) => e.event.eventSlug === `dash-upcoming-${stamp}`,
    );
    ok("nothing submitted yet", upcomingCard.feedback.submitted === null);
    ok("feedback shows as open", upcomingCard.feedback.open === true);
    ok("waitlisted status carried through", upcomingCard.status === "Waitlisted");
    ok("no certificate", upcomingCard.certificate === null);

    console.log("\n2. My certificates");
    const certificates = await resolveMyCertificates({ userId: user.id, email });
    ok("one certificate", certificates.length === 1);
    ok("event joined on", certificates[0]?.event?.eventTitle === past.eventTitle);
    ok(
      "no file URL in the list",
      !JSON.stringify(certificates[0]).toLowerCase().includes("x-amz"),
    );

    // ── Course: 3 published lessons + 1 unpublished, 1 completed ───────────
    console.log("\n3. My free courses");
    const course = await FreeCourse.create({
      title: `Dash Course ${stamp}`,
      slug: `dash-course-${stamp}`,
      isPublished: true,
    });
    created.courses.push(course);

    const moduleOne = await FreeCourseModule.create({
      freeCourseId: course.id,
      title: "Module One",
      slug: "module-one",
      order: 1,
      isPublished: true,
    });

    const lessons = [];
    for (const [index, title] of ["Intro", "Middle", "End"].entries()) {
      lessons.push(
        await FreeCourseLesson.create({
          freeCourseModuleId: moduleOne.id,
          title,
          slug: title.toLowerCase(),
          order: index + 1,
          isPublished: true,
        }),
      );
    }

    // Not live yet — must not count toward the total, and must never be picked
    // as the next lesson.
    await FreeCourseLesson.create({
      freeCourseModuleId: moduleOne.id,
      title: "Draft",
      slug: "draft",
      order: 4,
      isPublished: false,
    });

    await FreeCourseEnrollment.create({ userId: user.id, courseId: course.id });

    await FreeCourseLessonProgress.create({
      userId: user.id,
      freeCourseLessonId: lessons[0].id,
      completed: true,
      completedAt: new Date(),
    });

    const courses = await resolveMyCourses(user.id);
    ok("one enrolment", courses.length === 1);
    ok(
      "unpublished lesson excluded from the total",
      courses[0].progress.total === 3,
      `total ${courses[0].progress.total}`,
    );
    ok("one completed", courses[0].progress.completed === 1);
    ok("percent computed server-side", courses[0].progress.percent === 33);
    ok("not finished", courses[0].progress.completedCourse === false);
    ok(
      "next lesson is the first incomplete one",
      courses[0].nextLesson?.slug === "middle",
      courses[0].nextLesson?.slug,
    );
    ok("next lesson carries its module slug", courses[0].nextLesson?.moduleSlug === "module-one");

    console.log("\n4. Completing everything");
    for (const lesson of lessons.slice(1)) {
      await FreeCourseLessonProgress.create({
        userId: user.id,
        freeCourseLessonId: lesson.id,
        completed: true,
        completedAt: new Date(),
      });
    }

    const finished = await resolveMyCourses(user.id);
    ok("100 percent", finished[0].progress.percent === 100);
    ok("marked complete", finished[0].progress.completedCourse === true);
    ok(
      "still hands back a lesson to link to",
      finished[0].nextLesson?.slug === "end",
      finished[0].nextLesson?.slug,
    );

    console.log("\n5. A stranger sees nothing");
    const stranger = await resolveMyEvents({
      userId: "no-such-user",
      email: "nobody@example.com",
    });
    ok("no events", stranger.length === 0);
    ok(
      "no certificates",
      (await resolveMyCertificates({ userId: "no-such-user", email: "nobody@example.com" }))
        .length === 0,
    );
    ok("no courses", (await resolveMyCourses("no-such-user")).length === 0);
  } finally {
    console.log("\nCleaning up…");

    for (const course of created.courses) {
      const modules = await FreeCourseModule.findAll({
        where: { freeCourseId: course.id },
        attributes: ["id"],
      });
      const lessonRows = await FreeCourseLesson.findAll({
        where: { freeCourseModuleId: modules.map((m) => m.id) },
        attributes: ["id"],
      });

      await FreeCourseLessonProgress.destroy({
        where: { freeCourseLessonId: lessonRows.map((l) => l.id) },
      });
      await FreeCourseLesson.destroy({
        where: { freeCourseModuleId: modules.map((m) => m.id) },
      });
      await FreeCourseModule.destroy({ where: { freeCourseId: course.id } });
      await FreeCourseEnrollment.destroy({ where: { courseId: course.id } });
      await course.destroy();
    }

    for (const event of created.events) {
      await EventCertificate.destroy({ where: { eventId: event.id } });
      await EventFeedback.destroy({ where: { eventId: event.id } });
      await EventGuest.destroy({ where: { eventId: event.id } });
      await event.destroy();
    }

    await user.destroy();

    console.log(`\n${passed} passed, ${failed} failed.\n`);
  }
};

run()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((error) => {
    console.error("\nFAILED:", error);
    process.exit(1);
  });
