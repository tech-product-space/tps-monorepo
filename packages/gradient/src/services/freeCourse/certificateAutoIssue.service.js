import { Op, UniqueConstraintError } from "sequelize";

import db from "../../database/postgres/models/index.js";
const {
  FreeCourse,
  FreeCourseCertificate,
  FreeCourseEnrollment,
  User,
} = db;

import {
  FREE_COURSE_CERTIFICATE_ISSUED_VIA,
  FREE_COURSE_CERTIFICATE_STATUS,
} from "../../config/constants/freeCourseCertificate.js";
import { resolveFreeCourseSettings } from "../../util/helpers/freeCourseSettings.js";
import { generateCertificateNumber } from "../../util/helpers/certificateNumber.js";
import logger from "../../util/logger.js";
import { enqueueFreeCourseCertificateIssue } from "../../jobs/freeCourseCertificateIssueJob.js";
import { certificateReadiness } from "./certificateReadiness.service.js";
import {
  completedLessonIds,
  orderedLessonsByCourse,
} from "./lessonProgress.service.js";

/**
 * Statuses this can come back with. Exported so callers branch on a constant
 * rather than on a string literal that a typo makes permanently false.
 */
export const ENSURE_STATUS = Object.freeze({
  /** The course has auto-issue switched off. Not reachable via Admin. */
  OFF: "off",
  /** No template, no email, email disabled, or no published lessons. */
  NOT_READY: "not_ready",
  /** Published lessons remain — or there are none at all. */
  NOT_COMPLETE: "not_complete",
  /** No address to send to. */
  NO_EMAIL: "no_email",
  /** Nothing to put on the certificate. */
  NO_NAME: "no_name",
  /** A live certificate is already there. Returned with it. */
  EXISTS: "exists",
  /** Created, Approved and queued. */
  ISSUING: "issuing",
  /** Something threw. Logged, never propagated. */
  ERROR: "error",
});

/** What a caller outside the admin panel is allowed to see about a row. */
const publicCertificate = (certificate) =>
  certificate
    ? {
        certificateNo: certificate.certificateNo,
        status: certificate.status,
        recipientName: certificate.recipientName,
        issuedAt: certificate.issuedAt,
      }
    : null;

/**
 * Issue a course certificate if — and only if — it is owed and not already
 * there. Safe to call as often as you like.
 *
 * **Why this is one function with three callers rather than a trigger.**
 * Completing a course is not an event that happens once; it is a comparison,
 * `completed >= total`, and an admin can move `total` afterwards by publishing
 * a lesson. A learner can therefore become eligible with no action of their own
 * — most commonly when an admin unpublishes a draft lesson they had left live.
 * A trigger cannot see that. So the same check runs from:
 *
 *   Auto     the last lesson was just marked complete   (the normal path)
 *   Ensure   the completion modal or dashboard asked    (catches the drift)
 *   Admin    someone pressed Generate                   (the manual path)
 *
 * All three end at the same partial unique index, which is what actually makes
 * this idempotent — not the `exists` check, which can be raced.
 *
 * **Never throws.** On the Auto path the lesson is already saved by the time
 * this runs, and a failure here must not turn a successful "mark complete" into
 * a 500. The admin path is the designed fallback, not an emergency.
 */
export const ensureCourseCertificate = async ({
  userId,
  courseId,
  via = FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
  adminId = null,
}) => {
  try {
    const isAdmin = via === FREE_COURSE_CERTIFICATE_ISSUED_VIA.ADMIN;

    const course = await FreeCourse.findByPk(courseId, {
      attributes: ["id", "title", "settings"],
    });

    if (!course) return { status: ENSURE_STATUS.NOT_COMPLETE, reason: "no_course" };

    /**
     * Do they already hold one? Asked **first**, before every other check.
     *
     * Ordering this after the completion test was a real bug, and the obvious
     * arrangement: a learner certified at 12 lessons whose course then grew to
     * 15 is no longer at 100%, so the completion test rejected them and the
     * caller was told `not_complete` — about somebody holding a certificate for
     * that very course. The dashboard would then offer "Resume" next to their
     * own certificate.
     *
     * The question this function answers is "does this person have a
     * certificate for this course, and if not should they?" — and for anyone
     * who already has one the answer is settled regardless of what the course
     * has done since, whether auto-issue was switched off afterwards, or
     * whether an admin has since deleted the design.
     *
     * This is a cheap rejection, not the guard; the partial unique index below
     * is the guard.
     */
    const existing = await FreeCourseCertificate.findOne({
      where: {
        freeCourseId: courseId,
        userId,
        status: { [Op.ne]: FREE_COURSE_CERTIFICATE_STATUS.REVOKED },
      },
    });

    if (existing) {
      return {
        status: ENSURE_STATUS.EXISTS,
        certificate: publicCertificate(existing),
      };
    }

    // An admin pressing Generate overrides the switch — that is what the button
    // means. It does *not* override readiness or completion below: generating
    // with no template would only mint a row that fails to render.
    if (!isAdmin) {
      const settings = resolveFreeCourseSettings(course);
      if (!settings.autoIssueCertificate) {
        return { status: ENSURE_STATUS.OFF };
      }
    }

    const readiness = await certificateReadiness(course);

    if (!readiness.ready) {
      // Nothing at all is created. The alternative — render now and leave it
      // unsent until someone writes the email — produces Issued rows nobody was
      // sent, which reads like success in every list that counts them. Leaving
      // no trace means the admin's Learners tab still shows this learner as
      // owed a certificate, which is true.
      logger.warn("Free course certificate skipped: course is not set up", {
        courseId,
        userId,
        missing: readiness.missing,
      });

      return { status: ENSURE_STATUS.NOT_READY, missing: readiness.missing };
    }

    // Completion is answered by the dashboard's own helpers — which already
    // exclude unpublished modules and lessons. A second copy of "is this course
    // finished" is exactly how the progress bar and the certificate start
    // disagreeing.
    const lessons = (await orderedLessonsByCourse([courseId])).get(courseId) || [];

    if (!lessons.length) {
      return { status: ENSURE_STATUS.NOT_COMPLETE, completed: 0, total: 0 };
    }

    const completed = await completedLessonIds(
      userId,
      lessons.map((lesson) => lesson.id),
    );

    if (completed.size < lessons.length) {
      return {
        status: ENSURE_STATUS.NOT_COMPLETE,
        completed: completed.size,
        total: lessons.length,
      };
    }

    const [user, enrolment] = await Promise.all([
      User.findByPk(userId, { attributes: ["id", "email", "fullName"] }),
      FreeCourseEnrollment.findOne({
        where: { userId, courseId },
        attributes: ["id", "name"],
        order: [["createdAt", "ASC"]],
      }),
    ]);

    const email = String(user?.email || "").trim().toLowerCase();

    if (!email) {
      // A certificate with nowhere to go. An Issued row nobody can be sent is
      // worse than no row: it counts as success everywhere.
      logger.warn("Free course certificate skipped: user has no email", {
        courseId,
        userId,
      });
      return { status: ENSURE_STATUS.NO_EMAIL };
    }

    // Enrolment name first — it is what they typed for this course. A blank
    // name is a blank certificate, so it is a skip, not a default.
    const recipientName = String(enrolment?.name || user?.fullName || "").trim();

    if (!recipientName) {
      logger.warn("Free course certificate skipped: no name to put on it", {
        courseId,
        userId,
      });
      return { status: ENSURE_STATUS.NO_NAME };
    }

    let certificate;

    try {
      certificate = await FreeCourseCertificate.create({
        freeCourseId: courseId,
        userId,
        enrolmentId: enrolment?.id || null,
        certificateNo: generateCertificateNumber(),
        recipientName,
        recipientEmail: email,
        // Straight to Approved. On the Auto and Ensure paths there is no admin
        // to approve, and that is what the setting encodes; on the Admin path
        // pressing Generate *is* the approval.
        status: FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
        issuedVia: via,
        issuedBy: isAdmin ? adminId : null,
        lessonsAtIssue: lessons.length,
      });
    } catch (error) {
      // Lost the race against another tab, another worker, or an admin pressing
      // Generate at the same moment. The index did its job; read back what won.
      if (error instanceof UniqueConstraintError) {
        const winner = await FreeCourseCertificate.findOne({
          where: {
            freeCourseId: courseId,
            userId,
            status: { [Op.ne]: FREE_COURSE_CERTIFICATE_STATUS.REVOKED },
          },
        });

        return {
          status: ENSURE_STATUS.EXISTS,
          certificate: publicCertificate(winner),
        };
      }

      throw error;
    }

    await enqueueFreeCourseCertificateIssue(certificate.id);

    return {
      status: ENSURE_STATUS.ISSUING,
      certificate: publicCertificate(certificate),
    };
  } catch (error) {
    logger.error("ensureCourseCertificate failed", {
      courseId,
      userId,
      error: error.message,
    });

    return { status: ENSURE_STATUS.ERROR };
  }
};
