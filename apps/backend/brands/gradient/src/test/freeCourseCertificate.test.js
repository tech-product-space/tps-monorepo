/**
 * Manual script — `node src/test/freeCourseCertificate.test.js`
 *
 * Free course certificates end to end: readiness, the automatic trigger, every
 * refusal case, idempotency under a race, and the drift case where an admin
 * publishes a lesson after somebody has already been certified.
 *
 * Creates its own course, modules, lessons and users, and tears everything down
 * at the end.
 *
 * **No email leaves the machine**, and that takes two things, not one.
 *
 * `initEmailProviders()` is never called in a standalone script, so this
 * process has no transports and `sendMail` fails closed. That alone is not
 * enough. With `AGENDA_JOBS_ENABLED=true` — which is what `.env` says here —
 * every enqueue writes a row to the shared `agenda_jobs` table, and any running
 * worker or dev server drains it *in its own process*, where providers **are**
 * initialised. The first version of this file did exactly that: 30 real jobs,
 * all picked up and mailed by a worker running alongside, which showed up as a
 * flaky `emailSentAt` that no amount of staring at the issue service explained.
 *
 * So the switch is forced off below, before anything reads it, which sends
 * every enqueue down the inline path and keeps the work inside this process.
 * That is also what makes the run deterministic.
 */
import { createCanvas } from "@napi-rs/canvas";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ulid } from "ulid";

// Before anything imports config/env.js, which reads process.env once at module
// load. Static imports are hoisted and would run first, so everything below has
// to be a dynamic import — the same shape agendaJobs.test.js uses, for the same
// reason. dotenv does not overwrite a variable that is already set, so this wins.
process.env.AGENDA_JOBS_ENABLED = "false";

const db = (await import("../database/postgres/models/index.js")).default;
const s3 = (await import("../config/awsS3.js")).default;
const env = (await import("../config/env.js")).default;
const { putObject } = await import("../util/s3.js");
const { initCertificateFonts } = await import("../services/certificate/fonts.js");
const { ENSURE_STATUS, ensureCourseCertificate } = await import(
  "../services/freeCourse/certificateAutoIssue.service.js"
);
const { certificateReadiness } = await import(
  "../services/freeCourse/certificateReadiness.service.js"
);
const {
  FREE_COURSE_CERTIFICATE_ISSUED_VIA,
  FREE_COURSE_CERTIFICATE_STATUS,
} = await import("../config/constants/freeCourseCertificate.js");
const { FREE_COURSE_EMAIL_TYPES } = await import(
  "../config/constants/freeCourse.js"
);
const { resolveMyCourses } = await import(
  "../services/dashboard/myCourses.service.js"
);
const { settleFreeCourseCertificates } = await import(
  "./support/settleFreeCourseCertificates.js"
);
const { getTransporters } = await import("../services/email/emailManager.js");
const { completeLesson } = await import(
  "../controllers/freeCourses/lesson.controller.js"
);
const { retryCertificate } = await import(
  "../controllers/freeCourseCertificate/issue.controller.js"
);

const {
  FreeCourse,
  FreeCourseModule,
  FreeCourseLesson,
  FreeCourseLessonProgress,
  FreeCourseEnrollment,
  FreeCourseCertificate,
  FreeCourseCertificateTemplate,
  FreeCourseEmailTemplate,
  User,
} = db;

const W = 1600;
const H = 1131;

let passed = 0;
let failed = 0;

const ok = (label, condition, detail = "") => {
  condition ? passed++ : failed++;
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

/**
 * Drive an `asyncWrapper`-wrapped controller directly and wait for its response.
 *
 * The waiting is the whole point. `asyncWrapper` is
 * `(req, res, next) => { Promise.resolve(fn(...)).catch(next) }` — it returns
 * **undefined**, so `await controller(...)` resolves immediately and reads the
 * response before the handler has written one. Resolving off `res.json` is what
 * actually tracks completion; `next` rejects, so a thrown error surfaces here
 * as a failed await rather than vanishing into a no-op callback.
 *
 * The alternative — standing up the app and issuing real requests — drags in
 * auth middleware and a listening port for what is, here, one function call.
 */
const callController = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = { statusCode: 200, body: null };

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    res.json = (payload) => {
      res.body = payload;
      resolve(res);
      return res;
    };

    handler(req, res, reject);
  });

const makeBackground = () => {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 14;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  return canvas.toBuffer("image/png");
};

const stamp = Date.now();
const backgroundKey = `tmp/free-course-cert-test-${stamp}.png`;

let course;
let lessons = [];
const users = {};
const createdUserIds = [];

/** A learner with an enrolment, and optionally all lessons finished. */
const makeLearner = async (label, { complete = true, email = true } = {}) => {
  const user = await User.create({
    fullName: `Test ${label}`,
    email: email ? `fc-cert-${label}-${stamp}@example.test` : null,
    password: "not-a-real-password",
  });

  createdUserIds.push(user.id);

  await FreeCourseEnrollment.create({
    userId: user.id,
    courseId: course.id,
    name: `Test ${label}`,
  });

  if (complete) {
    await FreeCourseLessonProgress.bulkCreate(
      lessons.map((lesson) => ({
        userId: user.id,
        freeCourseLessonId: lesson.id,
        completed: true,
        completedAt: new Date(),
      })),
    );
  }

  users[label] = user;
  return user;
};

const setup = async () => {
  initCertificateFonts();

  await putObject({
    key: backgroundKey,
    body: makeBackground(),
    contentType: "image/png",
  });

  course = await FreeCourse.create({
    title: `Certificate Test Course ${stamp}`,
    slug: `certificate-test-course-${stamp}`,
    isPublished: true,
  });

  const module = await FreeCourseModule.create({
    freeCourseId: course.id,
    title: "Module One",
    slug: `module-one-${stamp}`,
    order: 1,
    isPublished: true,
  });

  lessons = await FreeCourseLesson.bulkCreate([
    {
      freeCourseModuleId: module.id,
      title: "Lesson One",
      slug: `lesson-one-${stamp}`,
      order: 1,
      isPublished: true,
    },
    {
      freeCourseModuleId: module.id,
      title: "Lesson Two",
      slug: `lesson-two-${stamp}`,
      order: 2,
      isPublished: true,
    },
  ]);

  return module;
};

const teardown = async (module) => {
  await FreeCourseCertificate.destroy({ where: { freeCourseId: course.id } });
  await FreeCourseCertificateTemplate.destroy({
    where: { freeCourseId: course.id },
  });
  await FreeCourseEmailTemplate.destroy({ where: { freeCourseId: course.id } });
  await FreeCourseLessonProgress.destroy({
    where: { userId: createdUserIds },
  });
  await FreeCourseEnrollment.destroy({ where: { courseId: course.id } });
  await FreeCourseLesson.destroy({ where: { freeCourseModuleId: module.id } });
  await FreeCourseModule.destroy({ where: { freeCourseId: course.id } });
  await FreeCourse.destroy({ where: { id: course.id } });
  await User.destroy({ where: { id: createdUserIds } });

  // Best-effort: a teardown that throws would mask the result of the run.
  await s3
    .send(
      new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: backgroundKey }),
    )
    .catch(() => {});
};

const run = async () => {
  const module = await setup();

  try {
    /* ── not ready ──────────────────────────────────────────────────────── */
    console.log("\nNothing configured yet");

    const alice = await makeLearner("alice");

    let readiness = await certificateReadiness(course);
    ok("readiness reports both pieces missing", !readiness.ready
      && readiness.missing.includes("template")
      && readiness.missing.includes("email"),
      readiness.missing.join(", "));

    let result = await ensureCourseCertificate({
      userId: alice.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
    });

    ok("a completed learner gets not_ready", result.status === ENSURE_STATUS.NOT_READY,
      result.status);
    ok("and NOTHING is created",
      (await FreeCourseCertificate.count({ where: { freeCourseId: course.id } })) === 0);

    // Admin Generate must not bypass readiness either — it would only mint a
    // row that fails to render.
    result = await ensureCourseCertificate({
      userId: alice.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ADMIN,
      adminId: null,
    });
    ok("admin Generate is refused too", result.status === ENSURE_STATUS.NOT_READY,
      result.status);

    /* ── template only ──────────────────────────────────────────────────── */
    console.log("\nDesign saved, email still missing");

    await FreeCourseCertificateTemplate.create({
      freeCourseId: course.id,
      name: "Test design",
      backgroundKey,
      canvasWidth: W,
      canvasHeight: H,
      orientation: "landscape",
      fields: [
        { key: "recipientName", x: 50, y: 50, fontSize: 64, align: "center" },
        { key: "courseTitle", x: 50, y: 62, fontSize: 28, align: "center" },
        { key: "certificateNo", x: 50, y: 90, fontSize: 18, align: "center" },
        { key: "issuedDate", x: 50, y: 95, fontSize: 18, align: "center" },
      ],
    });

    readiness = await certificateReadiness(course);
    ok("still not ready — the email is not the softer half",
      !readiness.ready && readiness.missing.includes("email"));

    /* ── disabled email ─────────────────────────────────────────────────── */
    console.log("\nEmail written but switched off");

    const emailTemplate = await FreeCourseEmailTemplate.create({
      freeCourseId: course.id,
      type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
      subject: "Your certificate for {{courseTitle}}",
      body: "Well done {{name}} — {{certificateNo}}",
      isEnabled: false,
    });

    readiness = await certificateReadiness(course);
    ok("a parked draft reads as not ready",
      !readiness.ready && readiness.missing.includes("emailDisabled"));

    await emailTemplate.update({ isEnabled: true });

    /* ── ready ──────────────────────────────────────────────────────────── */
    console.log("\nFully configured");

    readiness = await certificateReadiness(course);
    ok("readiness is green", readiness.ready, readiness.missing.join(", "));
    ok("and it counts the published lessons", readiness.publishedLessons === 2,
      String(readiness.publishedLessons));

    result = await ensureCourseCertificate({
      userId: alice.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
    });

    ok("a completed learner is issued", result.status === ENSURE_STATUS.ISSUING,
      result.status);
    ok("with a certificate number", Boolean(result.certificate?.certificateNo),
      result.certificate?.certificateNo);

    /* ── incomplete learner ─────────────────────────────────────────────── */
    console.log("\nRefusals that are not configuration");

    const bob = await makeLearner("bob", { complete: false });
    await FreeCourseLessonProgress.create({
      userId: bob.id,
      freeCourseLessonId: lessons[0].id,
      completed: true,
      completedAt: new Date(),
    });

    result = await ensureCourseCertificate({
      userId: bob.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
    });
    ok("half-finished gets not_complete", result.status === ENSURE_STATUS.NOT_COMPLETE,
      `${result.completed}/${result.total}`);

    // An admin cannot generate for somebody who has not finished either.
    result = await ensureCourseCertificate({
      userId: bob.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ADMIN,
    });
    ok("and an admin cannot force it", result.status === ENSURE_STATUS.NOT_COMPLETE);

    /*
     * The mirror of the case above, and the one that actually got reported:
     * jump straight to the *last* lesson from the sidebar and tick it off.
     * Completion is a set-size comparison so this is the same code path, but
     * the player used to treat "no next lesson" as "course finished" and
     * celebrate it — the reason to pin the shape, not just the count.
     */
    const skipper = await makeLearner("skipper", { complete: false });
    await FreeCourseLessonProgress.create({
      userId: skipper.id,
      freeCourseLessonId: lessons[lessons.length - 1].id,
      completed: true,
      completedAt: new Date(),
    });

    result = await ensureCourseCertificate({
      userId: skipper.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
    });
    ok("last lesson only is still not_complete",
      result.status === ENSURE_STATUS.NOT_COMPLETE,
      `${result.completed}/${result.total}`);
    ok("and mints nothing",
      (await FreeCourseCertificate.count({
        where: { freeCourseId: course.id, userId: skipper.id },
      })) === 0);

    /* ── auto-issue off ─────────────────────────────────────────────────── */
    console.log("\nAuto-issue switched off");

    await course.update({ settings: { autoIssueCertificate: false } });
    const carol = await makeLearner("carol");

    result = await ensureCourseCertificate({
      userId: carol.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
    });
    ok("the automatic path stands down", result.status === ENSURE_STATUS.OFF,
      result.status);

    result = await ensureCourseCertificate({
      userId: carol.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ADMIN,
    });
    ok("but admin Generate overrides the switch",
      result.status === ENSURE_STATUS.ISSUING, result.status);

    /*
     * The regression this section exists for, through the real entry point.
     *
     * `courseCompleted` used to be read off `ensure`'s status as "anything
     * that is not not_complete". But `ensure` answers OFF — and NOT_READY, and
     * NO_EMAIL — *before* it ever counts lessons, so on a course with the
     * switch off every single lesson completion came back
     * `courseCompleted: true` and the player threw confetti and a "Course
     * complete" dialog at somebody on lesson one. Completion is a lesson
     * count; it cannot be inferred from what the certificate service decided.
     */
    const dinah = await makeLearner("dinah", { complete: false });

    const firstRes = await callController(completeLesson, {
      params: { id: lessons[0].id },
      body: { userId: dinah.id },
    });

    ok("with auto-issue off, one lesson down is not a finished course",
      firstRes.body?.courseCompleted === false,
      String(firstRes.body?.courseCompleted));
    ok("and nothing is offered for the player to celebrate with",
      firstRes.body?.certificate === null,
      JSON.stringify(firstRes.body?.certificate));

    const dinahLastRes = await callController(completeLesson, {
      params: { id: lessons[lessons.length - 1].id },
      body: { userId: dinah.id },
    });

    ok("the last one is, even with the switch off",
      dinahLastRes.body?.courseCompleted === true,
      String(dinahLastRes.body?.courseCompleted));
    ok("and the certificate block says the course issues nothing",
      dinahLastRes.body?.certificate?.status === ENSURE_STATUS.OFF,
      dinahLastRes.body?.certificate?.status);
    ok("so no row was minted behind the switch",
      (await FreeCourseCertificate.count({
        where: { freeCourseId: course.id, userId: dinah.id },
      })) === 0);

    await course.update({ settings: { autoIssueCertificate: true } });

    /* ── idempotency ────────────────────────────────────────────────────── */
    console.log("\nCalled again, and again at the same moment");

    result = await ensureCourseCertificate({
      userId: alice.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
    });
    ok("a second call returns the existing one",
      result.status === ENSURE_STATUS.EXISTS, result.status);

    const dave = await makeLearner("dave");

    // Four at once, which is what two tabs and a double-click look like.
    const racers = await Promise.all(
      Array.from({ length: 4 }, () =>
        ensureCourseCertificate({
          userId: dave.id,
          courseId: course.id,
          via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
        }),
      ),
    );

    const created = racers.filter((r) => r.status === ENSURE_STATUS.ISSUING);
    const daveRows = await FreeCourseCertificate.count({
      where: { freeCourseId: course.id, userId: dave.id },
    });

    ok("exactly one of four concurrent calls creates", created.length === 1,
      `${created.length} created`);
    ok("and exactly one row exists", daveRows === 1, `${daveRows} rows`);
    ok("the losers report exists, not error",
      racers.filter((r) => r.status === ENSURE_STATUS.EXISTS).length === 3);

    /* ── render + email ─────────────────────────────────────────────────── */
    console.log("\nRendering");

    const settled = await settleFreeCourseCertificates(course.id);
    ok("every queued certificate settled", settled);

    const aliceCert = await FreeCourseCertificate.findOne({
      where: { freeCourseId: course.id, userId: alice.id },
    });

    ok("issued", aliceCert.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
      aliceCert.status + (aliceCert.lastError ? ` — ${aliceCert.lastError}` : ""));
    ok("with a PDF in storage", Boolean(aliceCert.fileKey), aliceCert.fileKey);
    ok("the design is snapshotted",
      aliceCert.templateSnapshot?.canvasWidth === W);
    ok("lessonsAtIssue records what was true", aliceCert.lessonsAtIssue === 2,
      String(aliceCert.lessonsAtIssue));
    // Both halves of the email guard, asserted rather than assumed.
    ok("the queue is inline, so no worker can drain this run",
      env.agendaEnabled === false);
    ok("and this process has no transports",
      getTransporters().length === 0);
    ok("so no email went out",
      aliceCert.emailSentAt === null, `emailSentAt=${aliceCert.emailSentAt}`);

    /* ── the real trigger ───────────────────────────────────────────────── */
    console.log("\nMarking the last lesson complete, through the controller");

    const erin = await makeLearner("erin", { complete: false });

    // All but the last, so the next call is genuinely the completing one.
    await FreeCourseLessonProgress.bulkCreate(
      lessons.slice(0, -1).map((lesson) => ({
        userId: erin.id,
        freeCourseLessonId: lesson.id,
        completed: true,
        completedAt: new Date(),
      })),
    );

    const midRes = await callController(completeLesson, {
      params: { id: lessons[0].id },
      body: { userId: erin.id },
    });

    ok("re-completing an earlier lesson does not claim the course is done",
      midRes.body?.courseCompleted === false,
      String(midRes.body?.courseCompleted));

    const lastRes = await callController(completeLesson, {
      params: { id: lessons[lessons.length - 1].id },
      body: { userId: erin.id },
    });

    ok("the completing call reports the course finished",
      lastRes.body?.courseCompleted === true,
      String(lastRes.body?.courseCompleted));
    ok("and hands the player a certificate state to open its modal with",
      lastRes.body?.certificate?.status === ENSURE_STATUS.ISSUING,
      lastRes.body?.certificate?.status);

    const erinCert = await FreeCourseCertificate.findOne({
      where: { freeCourseId: course.id, userId: erin.id },
    });
    ok("a certificate row exists, credited to the automatic path",
      erinCert?.issuedVia === FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
      erinCert?.issuedVia);

    // Pressing it again is the double-click case, through the real entry point.
    const againRes = await callController(completeLesson, {
      params: { id: lessons[lessons.length - 1].id },
      body: { userId: erin.id },
    });

    ok("marking it complete again mints nothing new",
      againRes.body?.certificate?.status === ENSURE_STATUS.EXISTS,
      againRes.body?.certificate?.status);
    ok("still exactly one row",
      (await FreeCourseCertificate.count({
        where: { freeCourseId: course.id, userId: erin.id },
      })) === 1);

    await settleFreeCourseCertificates(course.id);

    /* ── the drift case ─────────────────────────────────────────────────── */
    console.log("\nAn admin publishes a lesson after she was certified");

    const lateLesson = await FreeCourseLesson.create({
      freeCourseModuleId: module.id,
      title: "Lesson Three",
      slug: `lesson-three-${stamp}`,
      order: 3,
      isPublished: true,
    });
    lessons.push(lateLesson);

    await aliceCert.reload();
    ok("her certificate is untouched",
      aliceCert.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED);

    const shelf = await resolveMyCourses(alice.id);
    const aliceCourse = shelf.find((item) => item.course.id === course.id);

    ok("her progress honestly drops below 100%",
      aliceCourse.progress.completed === 2 && aliceCourse.progress.total === 3,
      `${aliceCourse.progress.completed}/${aliceCourse.progress.total}`);
    ok("completedCourse is now false",
      aliceCourse.progress.completedCourse === false);
    ok("but certificateEarned still says she finished",
      aliceCourse.certificateEarned === true);

    result = await ensureCourseCertificate({
      userId: alice.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
    });
    ok("ensure still reports EXISTS, not not_complete",
      result.status === ENSURE_STATUS.EXISTS, result.status);
    ok("and hands back the certificate she already holds",
      result.certificate?.certificateNo === aliceCert.certificateNo);

    /*
     * What the player actually receives when a certified learner ticks off a
     * lesson published after they finished.
     *
     * `courseCompleted` goes true again, correctly — she really is at 100% of
     * the longer course. So the player cannot decide from that flag alone
     * whether anything was earned; it has to read the certificate block. This
     * response used to carry a flatter `{ status, certificateNo }` while the
     * player typed it as the same state `ensure` returns, so the nested row
     * below was always undefined, the modal's "is it ready?" test fell through
     * to "still rendering", and it polled, found the old certificate, and
     * congratulated her on earning it a second time — confetti included.
     */
    const driftRes = await callController(completeLesson, {
      params: { id: lateLesson.id },
      body: { userId: alice.id },
    });

    ok("re-completing after drift still reports the course finished",
      driftRes.body?.courseCompleted === true,
      String(driftRes.body?.courseCompleted));
    ok("but the certificate block says EXISTS, never ISSUING",
      driftRes.body?.certificate?.status === ENSURE_STATUS.EXISTS,
      driftRes.body?.certificate?.status);
    ok("and nests the certificate she already holds, so the player can tell",
      driftRes.body?.certificate?.certificate?.certificateNo ===
        aliceCert.certificateNo,
      driftRes.body?.certificate?.certificate?.certificateNo);
    ok("still exactly one certificate for her",
      (await FreeCourseCertificate.count({
        where: { freeCourseId: course.id, userId: alice.id },
      })) === 1);

    // The same must hold if the course is later dismantled: a certificate
    // already in someone's hands does not depend on the design still existing.
    await course.update({ settings: { autoIssueCertificate: false } });
    result = await ensureCourseCertificate({
      userId: alice.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
    });
    ok("still EXISTS even with auto-issue switched off afterwards",
      result.status === ENSURE_STATUS.EXISTS, result.status);
    await course.update({ settings: { autoIssueCertificate: true } });

    /* ── drift in reverse: an admin unpublishes a lesson ─────────────────── */
    console.log("\nAn admin unpublishes a lesson after she was certified");

    /*
     * A learner who has *not* finished, so the interesting half is visible.
     * Unpublishing shrinks the denominator, which can push somebody to 100%
     * without them doing anything at all.
     */
    const frank = await makeLearner("frank", { complete: false });
    for (const lesson of [lessons[0], lessons[1]]) {
      await FreeCourseLessonProgress.create({
        userId: frank.id,
        freeCourseLessonId: lesson.id,
        completed: true,
        completedAt: new Date(),
      });
    }

    result = await ensureCourseCertificate({
      userId: frank.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
    });
    ok("before unpublishing, the unfinished learner gets not_complete",
      result.status === ENSURE_STATUS.NOT_COMPLETE,
      `${result.completed}/${result.total}`);

    await lateLesson.update({ isPublished: false });

    // Alice first: she is the one who already holds a certificate.
    await aliceCert.reload();
    ok("the certified learner's certificate is untouched",
      aliceCert.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED);
    ok("and lessonsAtIssue still records the course as it was",
      aliceCert.lessonsAtIssue === 2, String(aliceCert.lessonsAtIssue));

    const afterUnpublish = await resolveMyCourses(alice.id);
    const aliceAfter = afterUnpublish.find((i) => i.course.id === course.id);
    ok("her progress is back at 100% — the lesson simply stopped counting",
      aliceAfter.progress.completed === 2 && aliceAfter.progress.total === 2,
      `${aliceAfter.progress.completed}/${aliceAfter.progress.total}`);
    ok("completedCourse is true again", aliceAfter.progress.completedCourse === true);
    ok("and certificateEarned never wavered", aliceAfter.certificateEarned === true);

    result = await ensureCourseCertificate({
      userId: alice.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
    });
    ok("ensure still EXISTS, and mints nothing second",
      result.status === ENSURE_STATUS.EXISTS, result.status);
    ok("still exactly one certificate for her",
      (await FreeCourseCertificate.count({
        where: { freeCourseId: course.id, userId: alice.id },
      })) === 1);

    /*
     * Frank is the case worth knowing about: he finished nothing new, but the
     * course got shorter around him and he is now at 100%. `ensure` is the
     * safety net that notices — nothing in the player will, because the
     * automatic trigger is completing a lesson and he has none left to
     * complete.
     */
    const frankProgress = (await resolveMyCourses(frank.id)).find(
      (i) => i.course.id === course.id,
    );
    ok("the unfinished learner is now at 100% without lifting a finger",
      frankProgress.progress.completed === 2 &&
        frankProgress.progress.total === 2,
      `${frankProgress.progress.completed}/${frankProgress.progress.total}`);
    ok("but holds no certificate yet",
      frankProgress.certificateEarned === false);

    result = await ensureCourseCertificate({
      userId: frank.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
    });
    ok("and ensure now issues him one",
      result.status === ENSURE_STATUS.ISSUING, result.status);

    await settleFreeCourseCertificates(course.id);

    // Put the course back the way the later sections expect to find it.
    await lateLesson.update({ isPublished: true });

    /* ── a process dies mid-render ───────────────────────────────────────── */
    console.log("\nThe server restarts while a certificate is rendering");

    const { issueFreeCourseCertificate } = await import(
      "../services/freeCourse/certificateIssue.service.js"
    );
    const { STALE_ISSUING_MS } = await import(
      "../config/constants/freeCourseCertificate.js"
    );

    /*
     * Age a row's `updatedAt` past the staleness cutoff.
     *
     * A raw UPDATE, because Sequelize will not do it: a normal `update` stamps
     * `updatedAt` to now and overwrites the value, while `{ silent: true }`
     * suppresses the timestamp write entirely and leaves it untouched. Neither
     * moves it backwards, which is the only thing this needs.
     */
    const ageRow = (id, ms) =>
      db.sequelize.query(
        'UPDATE "FreeCourseCertificates" SET "updatedAt" = :when WHERE id = :id',
        { replacements: { when: new Date(Date.now() - ms), id } },
      );

    const grace = await makeLearner("grace");

    result = await ensureCourseCertificate({
      userId: grace.id,
      courseId: course.id,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
    });
    ok("a fresh certificate is queued", result.status === ENSURE_STATUS.ISSUING);

    const graceCert = await FreeCourseCertificate.findOne({
      where: { freeCourseId: course.id, userId: grace.id },
    });

    /*
     * Exactly what a killed process leaves behind: the claim flipped the row to
     * Issuing, then nothing ever committed it. No error was recorded, because
     * nothing got the chance to record one.
     */
    await graceCert.update({ status: FREE_COURSE_CERTIFICATE_STATUS.ISSUING });

    // A row touched a moment ago is presumed alive. Stealing it is how you get
    // two renders, two files and two emails for one learner.
    let outcome = await issueFreeCourseCertificate(graceCert.id);
    ok("a render still in flight is never stolen",
      outcome.skipped === FREE_COURSE_CERTIFICATE_STATUS.ISSUING,
      JSON.stringify(outcome));

    // Age it past the cutoff — the process that held it is long gone.
    await ageRow(graceCert.id, STALE_ISSUING_MS + 60_000);

    outcome = await issueFreeCourseCertificate(graceCert.id);
    ok("but an abandoned one is reclaimed and finished",
      outcome.success === true, JSON.stringify(outcome));

    await graceCert.reload();
    ok("and ends up Issued, not stranded",
      graceCert.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
      graceCert.status);
    ok("with a file attached", !!graceCert.fileKey);
    ok("still exactly one certificate for her",
      (await FreeCourseCertificate.count({
        where: { freeCourseId: course.id, userId: grace.id },
      })) === 1);

    // Retry must refuse a live render but accept an abandoned one — the admin
    // path to the same recovery.
    const liveCert = await FreeCourseCertificate.findOne({
      where: { freeCourseId: course.id, userId: grace.id },
    });
    await liveCert.update({ status: FREE_COURSE_CERTIFICATE_STATUS.ISSUING });

    let retryRes = await callController(retryCertificate, {
      params: { id: liveCert.id },
      admin: { id: null },
    });
    ok("admin retry refuses a live render", retryRes.statusCode === 422,
      retryRes.body?.message);

    await ageRow(liveCert.id, STALE_ISSUING_MS + 60_000);

    retryRes = await callController(retryCertificate, {
      params: { id: liveCert.id },
      admin: { id: null },
    });
    ok("but accepts an abandoned one", retryRes.statusCode === 200,
      retryRes.body?.message);

    await settleFreeCourseCertificates(course.id);

    /* ── revocation ─────────────────────────────────────────────────────── */
    console.log("\nRevoked, then replaced");

    await aliceCert.update({
      status: FREE_COURSE_CERTIFICATE_STATUS.REVOKED,
      revokedAt: new Date(),
    });

    const afterRevoke = await resolveMyCourses(alice.id);
    ok("a revoked certificate stops counting as earned",
      afterRevoke.find((i) => i.course.id === course.id).certificateEarned === false);

    // The partial index is what makes this possible: an unconditional unique
    // constraint would reject a replacement for an address that already has a
    // revoked row.
    const replacement = await FreeCourseCertificate.create({
      freeCourseId: course.id,
      userId: alice.id,
      certificateNo: `GRD-TEST-${ulid().slice(-8)}`,
      recipientName: "Alice Corrected",
      recipientEmail: alice.email,
      status: FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
      issuedVia: FREE_COURSE_CERTIFICATE_ISSUED_VIA.CORRECTION,
      replacesCertificateId: aliceCert.id,
    });

    ok("a replacement can be inserted alongside the revoked original",
      Boolean(replacement.id));

    let blocked = false;
    try {
      await FreeCourseCertificate.create({
        freeCourseId: course.id,
        userId: alice.id,
        certificateNo: `GRD-TEST-${ulid().slice(-8)}`,
        recipientName: "Alice Third",
        recipientEmail: alice.email,
        status: FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
      });
    } catch {
      blocked = true;
    }

    ok("but a SECOND live one is rejected by the index", blocked);
  } finally {
    await teardown(module);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.sequelize.close();
  process.exit(failed ? 1 : 0);
};

run().catch(async (error) => {
  console.error("\nTest run threw:", error);
  process.exit(1);
});
