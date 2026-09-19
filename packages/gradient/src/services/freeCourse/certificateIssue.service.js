import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const {
  FreeCourse,
  FreeCourseCertificate,
  FreeCourseCertificateTemplate,
  FreeCourseEmailTemplate,
} = db;

import {
  BODIES,
  buildEmail,
  EMAIL_PROVIDER_ID,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../email/index.js";
import { FREE_COURSE_CERTIFICATE_S3_PREFIX } from "../../config/constants/certificate.js";
import {
  FREE_COURSE_CERTIFICATE_STATUS,
  STALE_ISSUING_MS,
} from "../../config/constants/freeCourseCertificate.js";
import { FREE_COURSE_EMAIL_TYPES } from "../../config/constants/freeCourse.js";
import logger from "../../util/logger.js";
import capitalizeName from "../../util/helpers/capitalizeName.js";
import { putObject } from "../../util/s3.js";
import { renderFreeCourseCertificate } from "./certificateRender.service.js";

/**
 * Render, store and send one certificate.
 *
 * The whole state machine lives here so all three triggers — the last lesson
 * being completed, the idempotent re-check, and an admin pressing Generate —
 * go through identical steps.
 *
 * Ordering matters and is deliberate:
 *
 *   1. claim the row      (Issuing, so two workers cannot render the same one)
 *   2. render + upload    (slow, external, no DB transaction held open)
 *   3. commit Issued      ← the certificate now exists, independently of email
 *   4. send the email     (failure here leaves it Issued, only the mail retries)
 *
 * Step 3 before step 4 is the important one: holding a transaction across an S3
 * upload and an SMTP round trip means a late rollback orphans files and mail
 * that has already gone out.
 */
export const issueFreeCourseCertificate = async (certificateId) => {
  const certificate = await FreeCourseCertificate.findByPk(certificateId, {
    include: [{ model: FreeCourse, as: "course", attributes: ["id", "title"] }],
  });

  if (!certificate) {
    logger.warn("issueFreeCourseCertificate: certificate not found", {
      certificateId,
    });
    return { skipped: "not_found" };
  }

  const issuable = [
    FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
    FREE_COURSE_CERTIFICATE_STATUS.FAILED,
  ];

  /*
   * A row abandoned mid-render is claimable again once it goes cold.
   *
   * Without this, a process that dies between the claim and the commit strands
   * the row on Issuing permanently: retry refuses it, Generate's stale sweep
   * only looks at Approved, and the learner polls a certificate nobody is
   * building. The cutoff is the whole safety argument — a row touched in the
   * last few minutes is presumed alive and is never taken.
   */
  const staleIssuingBefore = new Date(Date.now() - STALE_ISSUING_MS);

  const claimable = {
    [Op.or]: [
      { status: { [Op.in]: issuable } },
      {
        status: FREE_COURSE_CERTIFICATE_STATUS.ISSUING,
        updatedAt: { [Op.lt]: staleIssuingBefore },
      },
    ],
  };

  const abandoned =
    certificate.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUING &&
    new Date(certificate.updatedAt) < staleIssuingBefore;

  if (!issuable.includes(certificate.status) && !abandoned) {
    // Already Issued, still Pending, Revoked, or genuinely being rendered right
    // now. A retried job landing on an Issued row must not send a second
    // certificate.
    return { skipped: certificate.status };
  }

  // Claim in a single conditional UPDATE rather than read-then-write. The check
  // above is a cheap rejection, not the guard: two jobs for the same row can
  // both pass it and then both render. Making the transition to Issuing the
  // thing that decides means exactly one of them proceeds — which is what lets
  // an admin safely re-queue a stalled row without risking a second email.
  //
  // It guards the reclaim too: this UPDATE bumps `updatedAt`, so a second
  // worker arriving a moment later no longer matches the staleness clause.
  const [claimed] = await FreeCourseCertificate.update(
    {
      status: FREE_COURSE_CERTIFICATE_STATUS.ISSUING,
      attempts: db.sequelize.literal(`"attempts" + 1`),
    },
    { where: { id: certificateId, ...claimable } },
  );

  if (!claimed) return { skipped: "claimed_elsewhere" };

  // The instance predates the UPDATE; keep it in step so the failure path below
  // records against the right state.
  certificate.status = FREE_COURSE_CERTIFICATE_STATUS.ISSUING;
  certificate.attempts += 1;

  try {
    const template = await FreeCourseCertificateTemplate.findOne({
      where: { freeCourseId: certificate.freeCourseId },
    });

    if (!template) {
      throw new Error("No certificate template exists for this course");
    }

    const issuedAt = new Date();

    const { pdf, warnings } = await renderFreeCourseCertificate({
      template,
      data: {
        recipientName: capitalizeName(certificate.recipientName),
        certificateNo: certificate.certificateNo,
        courseTitle: certificate.course?.title || "",
        issuedAt,
      },
    });

    if (warnings.length) {
      // Not fatal — a substituted font still produces a certificate — but it
      // should be findable afterwards rather than vanishing.
      logger.warn("Free course certificate rendered with warnings", {
        certificateNo: certificate.certificateNo,
        warnings,
      });
    }

    const fileKey = `${FREE_COURSE_CERTIFICATE_S3_PREFIX}/${certificate.freeCourseId}/${certificate.certificateNo}.pdf`;

    await putObject({
      key: fileKey,
      body: pdf,
      contentType: "application/pdf",
      // Private: the download route streams the bytes, which is what makes
      // revocation actually take the file away.
      isPrivate: true,
    });

    await certificate.update({
      status: FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
      fileKey,
      issuedAt,
      templateSnapshot: {
        name: template.name,
        backgroundKey: template.backgroundKey,
        canvasWidth: template.canvasWidth,
        canvasHeight: template.canvasHeight,
        orientation: template.orientation,
        fields: template.fields,
      },
      lastError: null,
    });
  } catch (error) {
    await certificate.update({
      status: FREE_COURSE_CERTIFICATE_STATUS.FAILED,
      lastError: error.message?.slice(0, 1000) || "Unknown error",
    });

    logger.error("Free course certificate issue failed", {
      certificateId,
      error: error.message,
    });

    return { success: false, error: error.message };
  }

  // Past the point of no return for the artifact: the PDF exists and the row
  // says so. Everything below only affects `emailSentAt`.
  const emailResult = await sendFreeCourseCertificateEmail(certificate);

  return { success: true, emailed: emailResult.success };
};

/**
 * Send (or resend) the certificate email.
 *
 * Separate from issuance so a bounced or failed send can be retried without
 * re-rendering — `emailSentAt` is tracked apart from `issuedAt` precisely for
 * this.
 *
 * The email carries no link to the file, by design. The certificate is private
 * and downloaded from the signed-in dashboard, so any URL put in an email would
 * either be dead within the hour or reachable by whoever the mail was forwarded
 * to. The template can still say where to go in its own words.
 */
export const sendFreeCourseCertificateEmail = async (certificate) => {
  const template = await FreeCourseEmailTemplate.findOne({
    where: {
      freeCourseId: certificate.freeCourseId,
      type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
    },
  });

  if (!template) {
    logger.warn(
      "No certificate email template; certificate issued but not sent",
      { certificateNo: certificate.certificateNo },
    );
    return { success: false, error: "No certificate email template" };
  }

  // A parked draft is not a send. Readiness already refuses to auto-issue in
  // this state; this covers the admin path, where Generate can be pressed while
  // the email is switched off.
  if (!template.isEnabled) {
    logger.warn("Certificate email is disabled; nothing sent", {
      certificateNo: certificate.certificateNo,
    });
    return { success: false, error: "Certificate email is disabled" };
  }

  const course =
    certificate.course ||
    (await FreeCourse.findByPk(certificate.freeCourseId, {
      attributes: ["title"],
    }));

  const variables = {
    name: capitalizeName(certificate.recipientName),
    recipientName: capitalizeName(certificate.recipientName),
    courseTitle: course?.title || "",
    certificateNo: certificate.certificateNo,
  };

  const html = buildEmail({
    body: BODIES.CUSTOM(template.body, variables),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  const result = await sendMail({
    // Pinned, not left to fall through the provider list.
    //
    // The provider list no longer starts with Outlook, but this stays
    // explicit: info@thegradient.co.in is a domain whose SPF record authorises only
    // secureserver.net while its mail is hosted on Microsoft 365, with no
    // DKIM selectors published and DMARC set to p=quarantine. Every message
    // down that path fails both checks and is quarantined by the recipient,
    // which looks exactly like this: the send reports success, `emailSentAt`
    // is written, and nobody receives anything.
    //
    // gradientlearnings.org is the identity that is actually set up — SES
    // DKIM verified and a custom MAIL FROM — so it aligns on both. It is also
    // the right sender on its own merits: a Gradient Learnings certificate
    // should not arrive from the Product Space domain.
    fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    to: certificate.recipientEmail,
    subject: BODIES.CUSTOM(template.subject, variables),
    html,
  });

  if (result.success) {
    await certificate.update({ emailSentAt: new Date() });
  } else {
    logger.error("Free course certificate email failed", {
      certificateNo: certificate.certificateNo,
      error: result.error,
    });
  }

  return result;
};
