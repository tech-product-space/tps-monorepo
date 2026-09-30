import db from "../../database/postgres/models/index.js";
const {
  FreeCourse,
  FreeCourseCertificate,
  FreeCourseCertificateTemplate,
  FreeCourseEmailTemplate,
} = db;

import { FREE_COURSE_EMAIL_TYPES } from "../../config/constants/freeCourse.js";
import { FREE_COURSE_CERTIFICATE_STATUS } from "../../config/constants/freeCourseCertificate.js";
import { resolveFreeCourseSettings } from "../../util/helpers/freeCourseSettings.js";
import { orderedLessonsByCourse } from "./lessonProgress.service.js";

/**
 * "If someone finishes the last lesson right now, does a certificate actually
 * go out?"
 *
 * Four checks, where the event version has two. A course can also have **no
 * published lessons**, in which case completion is unreachable and a banner
 * saying "ready" is simply lying — and a *disabled* email is as good as a
 * missing one, since `FreeCourseEmailTemplates.isEnabled` exists here.
 *
 * The email is not the softer requirement: a certificate that renders but
 * reaches nobody is worse than one that was never made, because the row says
 * Issued and nobody goes looking.
 *
 * Cheap enough to poll, and worth surfacing in more than one place — auto-issue
 * being on while the email is missing is silent otherwise, and the moment you
 * find out is when a learner asks where their certificate is.
 */
export const certificateReadiness = async (courseOrId) => {
  const course =
    typeof courseOrId === "string"
      ? await FreeCourse.findByPk(courseOrId, {
          attributes: ["id", "title", "settings"],
        })
      : courseOrId;

  if (!course) return null;

  const settings = resolveFreeCourseSettings(course);

  const [template, emailTemplate, lessonsByCourse, issuedCertificates] =
    await Promise.all([
    FreeCourseCertificateTemplate.findOne({
      where: { freeCourseId: course.id },
      attributes: ["id", "name"],
    }),
    FreeCourseEmailTemplate.findOne({
      where: {
        freeCourseId: course.id,
        type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
      },
      attributes: ["id", "isEnabled"],
    }),
    orderedLessonsByCourse([course.id]),
    // Not part of readiness — carried alongside it because the panel needs the
    // number to warn before publishing a lesson, and this is the call every
    // certificate screen already makes. Publishing one after certificates have
    // gone out drops those learners below 100% while their certificates stay
    // valid; the admin should meet that in a confirm dialog, not a ticket.
    FreeCourseCertificate.count({
      where: {
        freeCourseId: course.id,
        status: FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
      },
    }),
  ]);

  const publishedLessons = (lessonsByCourse.get(course.id) || []).length;

  const missing = [];
  if (!template) missing.push("template");
  if (!emailTemplate) missing.push("email");
  else if (!emailTemplate.isEnabled) missing.push("emailDisabled");
  if (!publishedLessons) missing.push("lessons");

  return {
    autoIssueCertificate: settings.autoIssueCertificate,
    hasTemplate: Boolean(template),
    hasEmailTemplate: Boolean(emailTemplate),
    emailEnabled: Boolean(emailTemplate?.isEnabled),
    hasPublishedLessons: publishedLessons > 0,
    publishedLessons,
    issuedCertificates,
    missing,
    ready: missing.length === 0,
  };
};
