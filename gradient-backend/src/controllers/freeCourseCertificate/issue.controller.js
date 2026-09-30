import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const {
  FreeCourse,
  FreeCourseCertificate,
  FreeCourseEnrollment,
  FreeCourseLessonProgress,
  User,
} = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  FREE_COURSE_CERTIFICATE_ISSUED_VIA,
  FREE_COURSE_CERTIFICATE_STATUS,
  STALE_APPROVED_MS,
  STALE_ISSUING_MS,
} from "../../config/constants/freeCourseCertificate.js";
import { generateCertificateNumber } from "../../util/helpers/certificateNumber.js";
import logger from "../../util/logger.js";
import {
  enqueueFreeCourseCertificateIssue,
  enqueueFreeCourseCertificateIssues,
} from "../../jobs/freeCourseCertificateIssueJob.js";
import {
  ENSURE_STATUS,
  ensureCourseCertificate,
} from "../../services/freeCourse/certificateAutoIssue.service.js";
import { certificateReadiness } from "../../services/freeCourse/certificateReadiness.service.js";
import { sendFreeCourseCertificateEmail } from "../../services/freeCourse/certificateIssue.service.js";
import {
  completedLessonIds,
  orderedLessonsByCourse,
} from "../../services/freeCourse/lessonProgress.service.js";

/**
 * GET /free-courses/certificates/admin/:courseId/readiness
 */
export const getReadiness = asyncWrapper(async (req, res) => {
  const readiness = await certificateReadiness(req.params.courseId);

  if (!readiness) {
    return res.status(404).json({ message: "Course not found" });
  }

  return res.status(200).json({ data: readiness });
});

/**
 * GET /free-courses/certificates/admin/:courseId/learners
 *
 * Who has finished, and where their certificate stands.
 *
 * The list is the union of two groups, not just one:
 *
 *   - everyone currently at 100% of the published lessons
 *   - everyone who **holds a certificate** for this course
 *
 * The second is not redundant. A course can grow after certificates go out, and
 * those learners are no longer at 100% — dropping them from this list would
 * hide exactly the rows an admin goes looking for when somebody asks about
 * their certificate. `lessonsAtIssue` is what explains the difference.
 *
 * Five queries regardless of size. The obvious shape — loop the enrolments and
 * ask about each learner — is four queries per learner, which is what makes an
 * admin table unusable at precisely the point the course becomes popular.
 */
export const getLearners = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const { filter } = req.query;

  const course = await FreeCourse.findByPk(courseId, {
    attributes: ["id", "title"],
  });

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  const lessons = (await orderedLessonsByCourse([courseId])).get(courseId) || [];
  const lessonIds = lessons.map((lesson) => lesson.id);

  // Everyone with any completed progress on this course, and how much.
  const progressRows = lessonIds.length
    ? await FreeCourseLessonProgress.findAll({
        where: {
          freeCourseLessonId: { [Op.in]: lessonIds },
          completed: true,
        },
        attributes: ["userId", "freeCourseLessonId"],
      })
    : [];

  const completedByUser = new Map();
  for (const row of progressRows) {
    // Counted through a Set: there is no unique index on
    // (userId, freeCourseLessonId), so duplicate rows are possible and would
    // otherwise push someone past 100%.
    if (!completedByUser.has(row.userId)) completedByUser.set(row.userId, new Set());
    completedByUser.get(row.userId).add(row.freeCourseLessonId);
  }

  const certificates = await FreeCourseCertificate.findAll({
    where: { freeCourseId: courseId },
    order: [["createdAt", "DESC"]],
  });

  // Newest row per user wins — a correction leaves an older revoked one behind.
  const certificateByUser = new Map();
  for (const certificate of certificates) {
    if (!certificateByUser.has(certificate.userId)) {
      certificateByUser.set(certificate.userId, certificate);
    }
  }

  const total = lessonIds.length;

  const completeUserIds = [...completedByUser.entries()]
    .filter(([, done]) => total > 0 && done.size >= total)
    .map(([userId]) => userId);

  const userIds = [
    ...new Set([...completeUserIds, ...certificateByUser.keys()]),
  ];

  if (!userIds.length) {
    return res.status(200).json({ data: { total, learners: [] } });
  }

  const [users, enrolments] = await Promise.all([
    User.findAll({
      where: { id: { [Op.in]: userIds } },
      attributes: ["id", "email", "fullName"],
    }),
    FreeCourseEnrollment.findAll({
      where: { courseId, userId: { [Op.in]: userIds } },
      attributes: ["id", "userId", "name", "createdAt"],
    }),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const enrolmentByUser = new Map(
    enrolments.map((enrolment) => [enrolment.userId, enrolment]),
  );

  let learners = userIds.map((userId) => {
    const user = userById.get(userId);
    const enrolment = enrolmentByUser.get(userId);
    const certificate = certificateByUser.get(userId) || null;
    const done = completedByUser.get(userId)?.size || 0;

    return {
      userId,
      name: enrolment?.name || user?.fullName || null,
      email: user?.email || null,
      enrolledAt: enrolment?.createdAt || null,
      progress: { completed: done, total },
      // True today. A certificate holder below 100% is the drift case: the
      // course grew after they earned it.
      isComplete: total > 0 && done >= total,
      certificate: certificate
        ? {
            id: certificate.id,
            certificateNo: certificate.certificateNo,
            status: certificate.status,
            issuedVia: certificate.issuedVia,
            issuedAt: certificate.issuedAt,
            emailSentAt: certificate.emailSentAt,
            lessonsAtIssue: certificate.lessonsAtIssue,
            lastError: certificate.lastError,
            recipientName: certificate.recipientName,
            recipientEmail: certificate.recipientEmail,
          }
        : null,
    };
  });

  if (filter === "none") {
    learners = learners.filter((learner) => !learner.certificate);
  } else if (filter === "failed") {
    learners = learners.filter(
      (learner) =>
        learner.certificate?.status === FREE_COURSE_CERTIFICATE_STATUS.FAILED,
    );
  } else if (filter === "notEmailed") {
    learners = learners.filter(
      (learner) =>
        learner.certificate?.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED &&
        !learner.certificate.emailSentAt,
    );
  }

  learners.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  return res.status(200).json({ data: { total, learners } });
});

/**
 * POST /free-courses/certificates/admin/:courseId/generate
 *
 * `{ userIds: [...] }` or `{ all: true }` — the Learners tab's Generate.
 *
 * Goes through the same `ensureCourseCertificate` every other path uses, with
 * `via: Admin`. Pressing this overrides the course's auto-issue switch — that
 * is what the button means — but **not** readiness or completion: generating
 * with no template would only mint a row that fails to render, and generating
 * for someone who has not finished would be issuing a certificate nobody
 * earned.
 *
 * Also re-queues rows stalled on Approved. A lost job leaves a certificate
 * that will never move on its own, and the admin's only other recourse is a
 * database edit.
 */
export const generateCertificates = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const { userIds, all } = req.body;
  const adminId = req.admin?.id || null;

  const course = await FreeCourse.findByPk(courseId, { attributes: ["id"] });

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  const readiness = await certificateReadiness(course);

  if (!readiness.ready) {
    return res.status(422).json({
      message:
        "This course is not set up to issue certificates yet: " +
        describeMissing(readiness.missing),
      data: readiness,
    });
  }

  let targets = Array.isArray(userIds) ? userIds : [];

  if (all) {
    const lessons =
      (await orderedLessonsByCourse([courseId])).get(courseId) || [];
    const lessonIds = lessons.map((lesson) => lesson.id);

    const rows = lessonIds.length
      ? await FreeCourseLessonProgress.findAll({
          where: {
            freeCourseLessonId: { [Op.in]: lessonIds },
            completed: true,
          },
          attributes: ["userId", "freeCourseLessonId"],
        })
      : [];

    const byUser = new Map();
    for (const row of rows) {
      if (!byUser.has(row.userId)) byUser.set(row.userId, new Set());
      byUser.get(row.userId).add(row.freeCourseLessonId);
    }

    targets = [...byUser.entries()]
      .filter(([, done]) => lessonIds.length && done.size >= lessonIds.length)
      .map(([userId]) => userId);
  }

  if (!targets.length) {
    return res.status(400).json({ message: "No learners selected" });
  }

  const results = { created: 0, existing: 0, requeued: 0, skipped: [] };

  for (const userId of targets) {
    const result = await ensureCourseCertificate({
      userId,
      courseId,
      via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ADMIN,
      adminId,
    });

    if (result.status === ENSURE_STATUS.ISSUING) {
      results.created += 1;
      continue;
    }

    if (result.status === ENSURE_STATUS.EXISTS) {
      results.existing += 1;

      // A row sitting on Approved for longer than a render could possibly take
      // has lost its job. Re-queue it rather than leaving the admin to wonder.
      //
      // Issuing counts too, and for a worse reason: that is where a process
      // killed mid-render leaves the row, and nothing else in the system will
      // ever move it. The claim in certificateIssue.service.js applies the same
      // cutoff, so a render genuinely in flight is not stolen.
      const stalled = await FreeCourseCertificate.findOne({
        where: {
          freeCourseId: courseId,
          userId,
          [Op.or]: [
            {
              status: FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
              updatedAt: { [Op.lt]: new Date(Date.now() - STALE_APPROVED_MS) },
            },
            {
              status: FREE_COURSE_CERTIFICATE_STATUS.ISSUING,
              updatedAt: { [Op.lt]: new Date(Date.now() - STALE_ISSUING_MS) },
            },
          ],
        },
        attributes: ["id"],
      });

      if (stalled) {
        await enqueueFreeCourseCertificateIssue(stalled.id);
        results.requeued += 1;
      }

      continue;
    }

    results.skipped.push({ userId, reason: result.status });
  }

  return res.status(200).json({
    message: `${results.created} queued, ${results.existing} already had one`,
    data: results,
  });
});

/** Turn a readiness `missing` array into something an admin can act on. */
const describeMissing = (missing = []) => {
  const labels = {
    template: "no certificate design",
    email: "no certificate email",
    emailDisabled: "the certificate email is switched off",
    lessons: "no published lessons",
  };

  return missing.map((key) => labels[key] || key).join(", ");
};

/**
 * GET /free-courses/certificates/admin/:courseId/certificates?search=
 *
 * A lookup: somebody asks where their certificate is, and this finds it by
 * number or by whose name is on it. Generating happens on the Learners tab,
 * against the person who earned it.
 */
export const listCertificates = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const { search, status } = req.query;

  const where = { freeCourseId: courseId };

  if (status) where.status = status;

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { certificateNo: { [Op.iLike]: term } },
      { recipientName: { [Op.iLike]: term } },
      { recipientEmail: { [Op.iLike]: term } },
    ];
  }

  const certificates = await FreeCourseCertificate.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: 100,
  });

  return res.status(200).json({ data: certificates });
});

/**
 * POST /free-courses/certificates/admin/certificates/:id/retry
 *
 * Re-queues a Failed row, and covers the stalled-on-Approved case too.
 *
 * An Issued row whose email never went is **not** handled here — that needs the
 * mail sent again, not the PDF rebuilt. See `resendCertificateEmail`.
 */
export const retryCertificate = asyncWrapper(async (req, res) => {
  const certificate = await FreeCourseCertificate.findByPk(req.params.id);

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  const retryable = [
    FREE_COURSE_CERTIFICATE_STATUS.FAILED,
    FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
  ];

  // A row still on Issuing after longer than any render takes was abandoned by
  // a process that died holding it — a restart mid-render is the usual way. It
  // is the one case where Issuing is safe to re-queue, and the claim applies
  // the same cutoff, so a live render is never disturbed.
  const abandoned =
    certificate.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUING &&
    new Date(certificate.updatedAt) < new Date(Date.now() - STALE_ISSUING_MS);

  if (!retryable.includes(certificate.status) && !abandoned) {
    return res.status(422).json({
      message:
        certificate.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUING
          ? "This certificate is being generated right now. Give it a minute."
          : `A ${certificate.status} certificate cannot be retried.`,
    });
  }

  if (certificate.status === FREE_COURSE_CERTIFICATE_STATUS.FAILED) {
    await certificate.update({
      status: FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
      lastError: null,
    });
  }

  await enqueueFreeCourseCertificateIssue(certificate.id);

  return res.status(200).json({ message: "Certificate re-queued" });
});

/**
 * POST /free-courses/certificates/admin/certificates/:id/resend
 *
 * The PDF is fine; only the mail needs another go. Never re-renders — an
 * already-downloaded certificate must not change under the recipient.
 */
export const resendCertificateEmail = asyncWrapper(async (req, res) => {
  const certificate = await FreeCourseCertificate.findByPk(req.params.id, {
    include: [{ model: FreeCourse, as: "course", attributes: ["id", "title"] }],
  });

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  if (certificate.status !== FREE_COURSE_CERTIFICATE_STATUS.ISSUED) {
    return res.status(422).json({
      message: "Only an issued certificate can be emailed.",
    });
  }

  const result = await sendFreeCourseCertificateEmail(certificate);

  if (!result.success) {
    return res
      .status(502)
      .json({ message: result.error || "The email could not be sent." });
  }

  return res.status(200).json({ message: "Certificate email sent" });
});

/**
 * PATCH /free-courses/certificates/admin/certificates/:id/revoke
 *
 * Withdraws a certificate. This actually works because the S3 object is private
 * and the download route is the only way to it — a revoked row stops resolving
 * there, so the file becomes unreachable rather than merely hidden.
 */
export const revokeCertificate = asyncWrapper(async (req, res) => {
  const certificate = await FreeCourseCertificate.findByPk(req.params.id);

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  if (certificate.status === FREE_COURSE_CERTIFICATE_STATUS.REVOKED) {
    return res.status(200).json({ message: "Already revoked" });
  }

  await certificate.update({
    status: FREE_COURSE_CERTIFICATE_STATUS.REVOKED,
    revokedAt: new Date(),
    revokedBy: req.admin?.id || null,
    revokeReason: req.body?.reason?.slice(0, 1000) || null,
  });

  return res.status(200).json({ message: "Certificate revoked" });
});

/**
 * PATCH /free-courses/certificates/admin/certificates/:id/restore
 *
 * Revocation is reversible — it is used for mistakes as often as for
 * misconduct. Refused, with a reason, when a live certificate for that learner
 * already exists: the partial unique index would reject it anyway, and a 500 is
 * a worse way to find out.
 */
export const restoreCertificate = asyncWrapper(async (req, res) => {
  const certificate = await FreeCourseCertificate.findByPk(req.params.id);

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  if (certificate.status !== FREE_COURSE_CERTIFICATE_STATUS.REVOKED) {
    return res.status(422).json({ message: "That certificate is not revoked." });
  }

  const live = await FreeCourseCertificate.findOne({
    where: {
      freeCourseId: certificate.freeCourseId,
      userId: certificate.userId,
      status: { [Op.ne]: FREE_COURSE_CERTIFICATE_STATUS.REVOKED },
    },
    attributes: ["certificateNo"],
  });

  if (live) {
    return res.status(409).json({
      message:
        `This learner already holds a live certificate (${live.certificateNo}). ` +
        "Revoke that one first if you meant to restore this.",
    });
  }

  // Back to whatever it was before, decided by whether the file still exists.
  await certificate.update({
    status: certificate.fileKey
      ? FREE_COURSE_CERTIFICATE_STATUS.ISSUED
      : FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
  });

  if (!certificate.fileKey) {
    await enqueueFreeCourseCertificateIssue(certificate.id);
  }

  return res.status(200).json({ message: "Certificate restored" });
});

/**
 * PATCH /free-courses/certificates/admin/certificates/:id/recipient
 *
 * Correct the name on a certificate.
 *
 * Revoke-and-replace rather than edit-in-place: the old PDF has already been
 * rendered and possibly downloaded, and quietly swapping the file under a
 * number somebody has shared is worse than issuing a new one. The replacement
 * points back at the original through `replacesCertificateId`.
 *
 * This is the flow the partial unique index exists for — an unconditional
 * constraint makes the replacement collide with the row it just revoked, which
 * is how correcting a misspelled name became a 500 on the event side.
 */
export const correctRecipient = asyncWrapper(async (req, res) => {
  const { recipientName } = req.body;

  if (!recipientName?.trim()) {
    return res.status(400).json({ message: "A name is required" });
  }

  const original = await FreeCourseCertificate.findByPk(req.params.id);

  if (!original) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  if (original.status === FREE_COURSE_CERTIFICATE_STATUS.REVOKED) {
    return res
      .status(422)
      .json({ message: "That certificate has already been revoked." });
  }

  const adminId = req.admin?.id || null;

  await original.update({
    status: FREE_COURSE_CERTIFICATE_STATUS.REVOKED,
    revokedAt: new Date(),
    revokedBy: adminId,
    revokeReason: "Replaced by a corrected certificate",
  });

  let replacement;

  try {
    replacement = await FreeCourseCertificate.create({
      freeCourseId: original.freeCourseId,
      userId: original.userId,
      enrolmentId: original.enrolmentId,
      certificateNo: generateCertificateNumber(),
      recipientName: recipientName.trim(),
      recipientEmail: original.recipientEmail,
      status: FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
      issuedVia: FREE_COURSE_CERTIFICATE_ISSUED_VIA.CORRECTION,
      issuedBy: adminId,
      lessonsAtIssue: original.lessonsAtIssue,
      replacesCertificateId: original.id,
    });
  } catch (error) {
    // Put the original back rather than leaving the learner with nothing.
    await original.update({
      status: original.fileKey
        ? FREE_COURSE_CERTIFICATE_STATUS.ISSUED
        : FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
    });

    logger.error("Certificate correction failed; original restored", {
      certificateId: original.id,
      error: error.message,
    });

    throw error;
  }

  await enqueueFreeCourseCertificateIssues([replacement.id]);

  return res.status(200).json({
    message: "A corrected certificate is being issued",
    data: { certificateNo: replacement.certificateNo },
  });
});
