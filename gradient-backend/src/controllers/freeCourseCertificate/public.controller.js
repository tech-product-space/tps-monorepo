import db from "../../database/postgres/models/index.js";
const { FreeCourse, FreeCourseCertificate } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { FREE_COURSE_CERTIFICATE_ISSUED_VIA } from "../../config/constants/freeCourseCertificate.js";
import { FREE_COURSE_CERTIFICATE_STATUS } from "../../config/constants/freeCourseCertificate.js";
import { getObjectBuffer } from "../../util/s3.js";
import {
  ENSURE_STATUS,
  ensureCourseCertificate,
} from "../../services/freeCourse/certificateAutoIssue.service.js";
import { resolveMyCourseCertificates } from "../../services/dashboard/myCourseCertificates.service.js";

/**
 * What the file is called once it lands in someone's Downloads folder.
 *
 * The course title makes it recognisable among a dozen others; the certificate
 * number keeps it unique. ASCII only, because the header is latin-1 and a title
 * with an em dash or an accent in it would otherwise mangle the whole filename.
 */
export const courseCertificateFileName = (certificate) => {
  const title = String(certificate.course?.title || "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return [title, certificate.certificateNo].filter(Boolean).join("-") + ".pdf";
};

/**
 * POST /free-courses/certificates/mine/:courseId/ensure
 *
 * "I think I've finished — is a certificate owed?" Idempotent, and safe to call
 * on every visit.
 *
 * This is the safety net for the cases a completion trigger cannot see: an
 * admin unpublishing a draft lesson pushes people to 100% with no action of
 * their own, and anyone who finished before the feature shipped never fired a
 * trigger at all. Called from the completion modal, the /completed page, and
 * the dashboard when a course reads as done with no certificate against it.
 *
 * Identity comes from the cookie. There is no version of this request that
 * mints a certificate in somebody else's name.
 */
export const ensureMyCourseCertificate = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user?.id;

  const result = await ensureCourseCertificate({
    userId,
    courseId,
    via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.ENSURE,
  });

  return res.status(200).json({
    data: {
      status: result.status,
      certificate: result.certificate || null,
      // Only meaningful on not_complete, and harmless elsewhere — the modal
      // uses it to say "3 lessons to go" rather than a bare refusal.
      completed: result.completed ?? null,
      total: result.total ?? null,
    },
  });
});

/**
 * GET /free-courses/certificates/mine/:courseId/status
 *
 * Polled by the completion modal while the PDF renders. Deliberately tiny — no
 * course join, no file, just the two fields the modal switches on.
 */
export const getMyCourseCertificateStatus = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user?.id;

  const certificate = await FreeCourseCertificate.findOne({
    where: { freeCourseId: courseId, userId },
    attributes: ["certificateNo", "status", "issuedAt"],
    order: [["createdAt", "DESC"]],
  });

  if (!certificate) {
    return res.status(200).json({ data: { status: ENSURE_STATUS.NOT_READY } });
  }

  return res.status(200).json({
    data: {
      status: certificate.status,
      certificateNo: certificate.certificateNo,
      issuedAt: certificate.issuedAt,
      ready: certificate.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
    },
  });
});

/**
 * GET /free-courses/certificates/mine
 *
 * A person's own course certificates. Kept alongside the unified
 * `/user/certificates` listing, which merges these with event ones — this one
 * exists for callers that only care about courses.
 */
export const getMyCourseCertificates = asyncWrapper(async (req, res) => {
  const certificates = await resolveMyCourseCertificates(req.user?.id);

  return res.status(200).json({ data: certificates });
});

/**
 * Fetch a course certificate the signed-in user owns, or null.
 *
 * Shared with the unified dashboard download route so ownership is decided in
 * one place. Ownership is re-checked here rather than trusted from a listing:
 * the certificate number is the only thing the browser sends.
 */
export const findOwnedCourseCertificate = async ({ userId, certificateNo }) =>
  FreeCourseCertificate.findOne({
    where: {
      certificateNo,
      userId,
      status: FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
    },
    include: [{ model: FreeCourse, as: "course", attributes: ["title"] }],
  });

/**
 * GET /free-courses/certificates/mine/:certificateNo/download
 *
 * Sends the PDF itself — bytes, not a link.
 *
 * The file is fetched from private storage server-side and streamed back under
 * `Content-Disposition: attachment`, so the browser saves it straight to disk.
 * The storage URL never reaches the client: nothing to copy out of the network
 * tab, nothing to paste to somebody else, and no expiry to race.
 *
 * A `Revoked` certificate stops resolving here, which is what makes revocation
 * mean something: this is the only route to the file.
 */
export const downloadMyCourseCertificate = asyncWrapper(async (req, res) => {
  const { certificateNo } = req.params;

  const certificate = await findOwnedCourseCertificate({
    userId: req.user?.id,
    certificateNo,
  });

  // 404 rather than 403 for one that exists but is not theirs — telling a
  // stranger "that number is real, just not yours" is the enumeration answer.
  if (!certificate || !certificate.fileKey) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  return sendCertificatePdf(res, certificate);
});

/**
 * Stream a certificate's bytes back. Shared with the unified download route.
 *
 * Certificates are single-page PDFs — tens of kilobytes — so buffering is
 * cheaper than the bookkeeping a streamed body needs to abort cleanly.
 */
export const sendCertificatePdf = async (res, certificate, fileName) => {
  const pdf = await getObjectBuffer(certificate.fileKey, { isPrivate: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", pdf.length);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName || courseCertificateFileName(certificate)}"`,
  );
  // A certificate is per-person and revocable; a cached copy in a shared proxy
  // is the one place revocation could not reach.
  res.setHeader("Cache-Control", "private, no-store");

  return res.status(200).send(pdf);
};
