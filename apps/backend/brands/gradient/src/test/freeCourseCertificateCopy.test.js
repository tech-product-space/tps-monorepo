/**
 * Manual script — `node src/test/freeCourseCertificateCopy.test.js`
 *
 * Copying a certificate setup between free courses, and the test-send.
 *
 * Creates two throwaway courses, puts a design and an email on one, and copies
 * onto the other. Tears both down at the end.
 *
 * **No email leaves the machine.** `initEmailProviders()` is never called in a
 * standalone script, so `sendMail` fails closed with no transports — which is
 * why the test-send assertions below expect a 422 rather than a 200. That is
 * the point of the check: `sendMail` resolves rather than throws, so a
 * controller that forgot to inspect `.success` would report an outage as a
 * successful send. `AGENDA_JOBS_ENABLED` is forced off for the same reason as
 * the main suite — see the comment there.
 */
process.env.AGENDA_JOBS_ENABLED = "false";

const db = (await import("../database/postgres/models/index.js")).default;
const { FREE_COURSE_EMAIL_TYPES } = await import(
  "../config/constants/freeCourse.js"
);
const { copyFromCourse, listCopySources } = await import(
  "../controllers/freeCourseCertificate/copy.controller.js"
);
const { sendTestEmail } = await import(
  "../controllers/freeCourseCertificate/email.controller.js"
);

const {
  FreeCourse,
  FreeCourseCertificateTemplate,
  FreeCourseEmailTemplate,
} = db;

let passed = 0;
let failed = 0;

const ok = (label, condition, detail = "") => {
  condition ? passed++ : failed++;
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

/** See the main suite for why resolving off `res.json` is what tracks completion. */
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

const stamp = Date.now();
const admin = { id: null, email: "admin@example.test" };

const FIELDS = [
  { key: "recipientName", x: 50, y: 45, fontSize: 48, align: "center" },
  { key: "courseTitle", x: 50, y: 60, fontSize: 28, align: "center" },
];

let source;
let target;

const setup = async () => {
  source = await FreeCourse.create({
    title: `Copy Source Course ${stamp}`,
    slug: `copy-source-course-${stamp}`,
    isPublished: true,
  });

  target = await FreeCourse.create({
    title: `Copy Target Course ${stamp}`,
    slug: `copy-target-course-${stamp}`,
    isPublished: true,
  });

  await FreeCourseCertificateTemplate.create({
    freeCourseId: source.id,
    name: "Shared Gold Border",
    backgroundKey: `tmp/copy-test-${stamp}.png`,
    canvasWidth: 1600,
    canvasHeight: 1131,
    orientation: "landscape",
    fields: FIELDS,
  });

  await FreeCourseEmailTemplate.create({
    freeCourseId: source.id,
    type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
    subject: "Your certificate for {{courseTitle}}",
    body: "<p>Well done {{name}} — {{certificateNo}}</p>",
    isEnabled: true,
  });
};

const teardown = async () => {
  const ids = [source?.id, target?.id].filter(Boolean);
  if (!ids.length) return;

  await FreeCourseCertificateTemplate.destroy({
    where: { freeCourseId: ids },
  });
  await FreeCourseEmailTemplate.destroy({ where: { freeCourseId: ids } });
  await FreeCourse.destroy({ where: { id: ids } });
};

try {
  await setup();

  /* ── the source list ──────────────────────────────────────────────────── */
  console.log("\nWhat can be copied from");

  let res = await callController(listCopySources, {
    params: { courseId: target.id },
    query: {},
    admin,
  });

  const listed = res.body?.data?.sources?.find((row) => row.id === source.id);

  ok("the source course is offered", !!listed);
  ok("with its design named", listed?.templateName === "Shared Gold Border");
  ok("and its email subject shown",
    listed?.emailSubject === "Your certificate for {{courseTitle}}");
  ok("a course never offers itself",
    !res.body?.data?.sources?.some((row) => row.id === target.id));
  ok("and the target reports it has nothing yet",
    res.body?.data?.target?.hasTemplate === false &&
      res.body?.data?.target?.hasEmail === false);

  /* ── search and the cap ───────────────────────────────────────────────── */
  console.log("\nSearching and capping");

  res = await callController(listCopySources, {
    params: { courseId: target.id },
    query: { search: "Copy Source Course" },
    admin,
  });
  ok("search narrows to the matching course",
    res.body?.data?.sources?.length === 1 &&
      res.body.data.sources[0].id === source.id);

  res = await callController(listCopySources, {
    params: { courseId: target.id },
    query: { search: "nothing-matches-this-zzz" },
    admin,
  });
  ok("a search with no matches returns nothing, not everything",
    res.body?.data?.sources?.length === 0 && res.body?.data?.total === 0);

  // The design's own name is searchable too, because it is what the list shows
  // and what tells two similarly-named courses apart.
  res = await callController(listCopySources, {
    params: { courseId: target.id },
    query: { search: "Gold Border" },
    admin,
  });
  ok("the design name is searchable",
    res.body?.data?.sources?.some((row) => row.id === source.id));

  res = await callController(listCopySources, {
    params: { courseId: target.id },
    query: { limit: 1 },
    admin,
  });
  ok("the cap is honoured", res.body?.data?.sources?.length <= 1);
  // The count behind the cap, so the dialog can say "1 of 12" rather than
  // implying what it shows is all there is.
  ok("and the total still counts everything past it",
    res.body?.data?.total >= 1, String(res.body?.data?.total));

  // A limit nobody should be able to raise from the client.
  res = await callController(listCopySources, {
    params: { courseId: target.id },
    query: { limit: 9999 },
    admin,
  });
  ok("an absurd limit is clamped", res.body?.data?.limit === 50);

  /* ── refusals ─────────────────────────────────────────────────────────── */
  console.log("\nRefusals");

  res = await callController(copyFromCourse, {
    params: { courseId: target.id },
    body: { fromCourseId: target.id, template: true },
    admin,
  });
  ok("a course cannot be copied onto itself", res.statusCode === 422);

  res = await callController(copyFromCourse, {
    params: { courseId: target.id },
    body: { fromCourseId: source.id },
    admin,
  });
  ok("copying neither half is rejected, not a silent no-op",
    res.statusCode === 400);

  /*
   * The important one. Asking for a half the source does not have must fail
   * the whole copy rather than quietly deliver the other half — a partial
   * "success" is discovered later by a learner, not by the admin.
   */
  const bare = await FreeCourse.create({
    title: `Copy Bare Course ${stamp}`,
    slug: `copy-bare-course-${stamp}`,
    isPublished: true,
  });

  res = await callController(copyFromCourse, {
    params: { courseId: target.id },
    body: { fromCourseId: bare.id, template: true, email: true },
    admin,
  });
  ok("copying from a course with no design is refused", res.statusCode === 422);
  ok("and nothing was written",
    (await FreeCourseCertificateTemplate.count({
      where: { freeCourseId: target.id },
    })) === 0);

  await FreeCourse.destroy({ where: { id: bare.id } });

  /* ── the copy itself ──────────────────────────────────────────────────── */
  console.log("\nCopying both halves");

  res = await callController(copyFromCourse, {
    params: { courseId: target.id },
    body: { fromCourseId: source.id, template: true, email: true },
    admin,
  });

  ok("the copy succeeds", res.statusCode === 200, res.body?.message);

  const copiedTemplate = await FreeCourseCertificateTemplate.findOne({
    where: { freeCourseId: target.id },
  });
  const copiedEmail = await FreeCourseEmailTemplate.findOne({
    where: {
      freeCourseId: target.id,
      type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
    },
  });

  ok("the design landed", !!copiedTemplate);

  // Compared property by property rather than by JSON.stringify: JSONB does not
  // preserve key order, so the stored row comes back as {x, y, key, align, ...}
  // and a string comparison fails on ordering alone while the content is
  // identical.
  const sameFields =
    copiedTemplate?.fields?.length === FIELDS.length &&
    FIELDS.every((expected) => {
      const actual = copiedTemplate.fields.find((f) => f.key === expected.key);
      return (
        actual &&
        Object.entries(expected).every(([key, value]) => actual[key] === value)
      );
    });

  ok("the field layout came with it", sameFields,
    JSON.stringify(copiedTemplate?.fields));

  // By reference, deliberately. Nothing deletes a background, so two courses
  // sharing one key cannot pull the image out from under each other.
  const sourceTemplate = await FreeCourseCertificateTemplate.findOne({
    where: { freeCourseId: source.id },
  });
  ok("the background is shared, not duplicated",
    copiedTemplate?.backgroundKey === sourceTemplate?.backgroundKey);

  ok("the email landed", !!copiedEmail);
  ok("with the subject intact",
    copiedEmail?.subject === "Your certificate for {{courseTitle}}");

  // `courseTitle` is a placeholder resolved at render time, so the copied
  // design prints the *target* course's title. If this key were ever replaced
  // by a literal at copy time, every certificate would carry the wrong course.
  ok("courseTitle stayed a placeholder",
    copiedTemplate?.fields?.some((field) => field.key === "courseTitle"));

  /* ── the send switch is not content ───────────────────────────────────── */
  console.log("\nRe-copying over an existing setup");

  await copiedEmail.update({ isEnabled: false, subject: "Locally edited" });

  res = await callController(copyFromCourse, {
    params: { courseId: target.id },
    body: { fromCourseId: source.id, template: false, email: true },
    admin,
  });

  await copiedEmail.reload();

  ok("re-copying overwrites the subject", res.statusCode === 200 &&
    copiedEmail.subject === "Your certificate for {{courseTitle}}");
  // Flipping this as a side effect of copying wording would either arm a course
  // nobody meant to arm, or quietly disarm a live one.
  ok("but leaves the send switch alone", copiedEmail.isEnabled === false);

  res = await callController(listCopySources, {
    params: { courseId: target.id },
    query: {},
    admin,
  });
  ok("the target now reports both halves present",
    res.body?.data?.target?.hasTemplate === true &&
      res.body?.data?.target?.hasEmail === true);

  /* ── test send ────────────────────────────────────────────────────────── */
  console.log("\nTest send");

  res = await callController(sendTestEmail, {
    params: { courseId: target.id },
    body: { subject: "Hi", body: "<p>Hi</p>", to: "not-an-address" },
    admin,
  });
  ok("a malformed address is rejected", res.statusCode === 400);

  res = await callController(sendTestEmail, {
    params: { courseId: target.id },
    body: { subject: "", body: "<p>Hi</p>", to: "someone@example.test" },
    admin,
  });
  ok("an empty subject is rejected", res.statusCode === 400);

  res = await callController(sendTestEmail, {
    params: { courseId: "01JZZZZZZZZZZZZZZZZZZZZZZZ" },
    body: { subject: "Hi", body: "<p>Hi</p>", to: "someone@example.test" },
    admin,
  });
  ok("an unknown course is a 404", res.statusCode === 404);

  // No transports in this process, so `sendMail` resolves `{success:false}`.
  // A controller that ignored `.success` would answer 200 here.
  res = await callController(sendTestEmail, {
    params: { courseId: target.id },
    body: {
      subject: "Your certificate for {{courseTitle}}",
      body: "<p>Well done {{name}}</p>",
      to: "someone@example.test",
    },
    admin,
  });
  ok("a failed send is reported as a failure, not a success",
    res.statusCode === 422, res.body?.error);
} catch (error) {
  failed++;
  console.error("\nUNCAUGHT", error);
} finally {
  await teardown();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.sequelize.close();
  process.exit(failed ? 1 : 0);
}
