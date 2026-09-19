import db from "../../database/postgres/models/index.js";
const { FreeCourse, FreeCourseEmailTemplate } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  BODIES,
  buildEmail,
  EMAIL_PROVIDER_ID,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../../services/email/index.js";
import {
  FREE_COURSE_EMAIL_TYPES,
  FREE_COURSE_EMAIL_TYPE_LIST,
} from "../../config/constants/freeCourse.js";
import capitalizeName from "../../util/helpers/capitalizeName.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /free-courses/certificates/admin/:courseId/email
 *
 * 404 when nothing is saved yet — that is the normal starting state and the
 * admin client treats it as an empty form, not a failure.
 */
export const getEmailTemplate = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const type = req.query.type || FREE_COURSE_EMAIL_TYPES.CERTIFICATE;

  if (!FREE_COURSE_EMAIL_TYPE_LIST.includes(type)) {
    return res.status(422).json({ message: `Unknown email type "${type}".` });
  }

  const template = await FreeCourseEmailTemplate.findOne({
    where: { freeCourseId: courseId, type },
  });

  if (!template) {
    return res.status(404).json({ message: "Email template not found" });
  }

  return res.status(200).json({ data: template });
});

/**
 * PUT /free-courses/certificates/admin/:courseId/email
 *
 * `isEnabled` is part of readiness, not a display flag: a disabled certificate
 * email makes the course read as not-ready, and auto-issue creates nothing
 * rather than minting Issued rows nobody was sent.
 */
export const upsertEmailTemplate = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const { subject, body, isEnabled } = req.body;
  const type = req.body.type || FREE_COURSE_EMAIL_TYPES.CERTIFICATE;

  if (!FREE_COURSE_EMAIL_TYPE_LIST.includes(type)) {
    return res.status(422).json({ message: `Unknown email type "${type}".` });
  }

  if (!subject?.trim() || !body?.trim()) {
    return res
      .status(400)
      .json({ message: "Both a subject and a body are required" });
  }

  const course = await FreeCourse.findByPk(courseId, { attributes: ["id"] });

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  const [template, created] = await FreeCourseEmailTemplate.findOrCreate({
    where: { freeCourseId: courseId, type },
    defaults: {
      freeCourseId: courseId,
      type,
      subject,
      body,
      isEnabled: isEnabled !== false,
    },
  });

  if (!created) {
    await template.update({
      subject,
      body,
      // Absent means "leave it as it is" — the editor saves subject and body
      // without necessarily sending the switch.
      ...(typeof isEnabled === "boolean" ? { isEnabled } : {}),
    });
  }

  return res.status(200).json({
    message: created ? "Email template created" : "Email template updated",
    data: template,
  });
});

/**
 * POST /free-courses/certificates/admin/:courseId/email/test
 *
 * Send the certificate email to one address so an admin sees the real thing
 * before a learner does.
 *
 * `subject` and `body` come from the request rather than the saved row on
 * purpose: the point of a test is to check what is on screen, which — right
 * after an edit — is not what is in the database yet.
 *
 * Deliberately ignores `isEnabled`. That switch decides whether *learners* get
 * this email, and the moment you most want a test is while the draft is still
 * parked. A test send is an explicit act by a named admin, not automation.
 *
 * Everything else mirrors `sendFreeCourseCertificateEmail` as closely as it
 * can: same builder, same header and footer, same variable set. A test that
 * renders differently from the real email is worse than no test at all.
 */
export const sendTestEmail = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const { subject, body, to, recipientName } = req.body;

  if (!subject?.trim() || !body?.trim() || !to?.trim()) {
    return res
      .status(400)
      .json({ message: "subject, body and 'to' are required" });
  }

  if (!EMAIL_PATTERN.test(to.trim())) {
    return res
      .status(400)
      .json({ message: "'to' must be a valid email address" });
  }

  const course = await FreeCourse.findByPk(courseId, {
    attributes: ["id", "title"],
  });

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  // `{{name}}` stands in for a real learner, so let the admin choose what it
  // renders as — testing with your own name is the point. Capitalised the same
  // way the real sender does it, so the test matches character for character.
  const sampleName = capitalizeName(
    (typeof recipientName === "string" && recipientName.trim()) ||
      "sample learner",
  );

  // Keep this list in step with `sendFreeCourseCertificateEmail`; a placeholder
  // that resolves here and renders blank in production is precisely the bug a
  // test is supposed to catch.
  const variables = {
    name: sampleName,
    recipientName: sampleName,
    courseTitle: course.title || "",
    certificateNo: "GRD-0000-SAMPLE",
  };

  const html = buildEmail({
    body: BODIES.CUSTOM(body, variables),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  // Prefixed so a test can never be mistaken for the real thing in a shared
  // inbox. It is the one deliberate difference from a production send.
  const result = await sendMail({
    // The same sender the real certificate email uses — see the note in
    // certificateIssue.service.js. A test that goes out over a different
    // identity than production tells you nothing about whether production
    // arrives, which is the entire question a test send exists to answer.
    fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    to: to.trim(),
    subject: `[Test] ${BODIES.CUSTOM(subject, variables)}`,
    html,
  });

  if (!result.success) {
    // `sendMail` resolves rather than throws, so an outage would otherwise look
    // like a success to the panel.
    return res.status(422).json({
      message: "Test email could not be sent",
      error: result.error,
    });
  }

  return res.status(200).json({ message: `Test email sent to ${to.trim()}` });
});
