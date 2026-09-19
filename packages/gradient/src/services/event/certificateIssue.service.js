import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { Event, EventCertificate, EventCertificateTemplate, EventEmailTemplate } = db;

import {
  BODIES,
  buildEmail,
  EMAIL_PROVIDER_ID,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../../services/email/index.js";
import {
  CERTIFICATE_S3_PREFIX,
  EVENT_CERTIFICATE_STATUS,
} from "../../config/constants/eventCertificate.js";
import { EVENT_EMAIL_TEMPLATE_TYPE } from "../../config/constants/event.js";
import logger from "../../util/logger.js";
import capitalizeName from "../../util/helpers/capitalizeName.js";
import { putObject } from "../../util/s3.js";
import { renderCertificate } from "./certificateRender.service.js";

/**
 * Render, store and send one certificate.
 *
 * The whole state machine lives here so both triggers — an admin approving, and
 * (from phase 4) a feedback submission — go through identical steps. TPS split
 * this across two endpoints, which is why a certificate could end up approved
 * but never generated with nothing to show for it.
 *
 * Ordering matters and is deliberate:
 *
 *   1. claim the row      (Issuing, so two workers cannot render the same one)
 *   2. render + upload    (slow, external, no DB transaction held open)
 *   3. commit Issued      ← the certificate now exists, independently of email
 *   4. send the email     (failure here leaves it Issued, only the mail retries)
 *
 * Step 3 before step 4 is the important one. TPS held a transaction across S3
 * uploads and sends, so a late rollback orphaned files and mail that had already
 * gone out.
 */
export const issueCertificate = async (certificateId) => {
  const certificate = await EventCertificate.findByPk(certificateId, {
    include: [{ model: Event, as: "event", attributes: ["id", "eventTitle"] }],
  });

  if (!certificate) {
    logger.warn("issueCertificate: certificate not found", { certificateId });
    return { skipped: "not_found" };
  }

  const issuable = [
    EVENT_CERTIFICATE_STATUS.APPROVED,
    EVENT_CERTIFICATE_STATUS.FAILED,
  ];

  if (!issuable.includes(certificate.status)) {
    // Already Issued, still Pending, or Revoked. A retried job landing on an
    // Issued row must not send a second certificate.
    return { skipped: certificate.status };
  }

  // Claim in a single conditional UPDATE rather than read-then-write. The check
  // above is a cheap rejection, not the guard: two jobs for the same row can
  // both pass it and then both render. Making the transition to Issuing the
  // thing that decides means exactly one of them proceeds — which is what lets
  // an admin safely re-queue a stalled row without risking a second email.
  const [claimed] = await EventCertificate.update(
    {
      status: EVENT_CERTIFICATE_STATUS.ISSUING,
      attempts: db.sequelize.literal(`"attempts" + 1`),
    },
    { where: { id: certificateId, status: { [Op.in]: issuable } } },
  );

  if (!claimed) return { skipped: "claimed_elsewhere" };

  // The instance predates the UPDATE; keep it in step so the failure path below
  // records against the right state.
  certificate.status = EVENT_CERTIFICATE_STATUS.ISSUING;
  certificate.attempts += 1;

  try {
    const template = await EventCertificateTemplate.findOne({
      where: { eventId: certificate.eventId },
    });

    if (!template) {
      throw new Error("No certificate template exists for this event");
    }

    const issuedAt = new Date();

    const { pdf, warnings } = await renderCertificate({
      template,
      data: {
        recipientName: capitalizeName(certificate.recipientName),
        certificateNo: certificate.certificateNo,
        eventTitle: certificate.event?.eventTitle || "",
        issuedAt,
      },
    });

    if (warnings.length) {
      // Not fatal — a substituted font still produces a certificate — but it
      // should be findable afterwards rather than vanishing.
      logger.warn("Certificate rendered with warnings", {
        certificateNo: certificate.certificateNo,
        warnings,
      });
    }

    const fileKey = `${CERTIFICATE_S3_PREFIX}/${certificate.eventId}/${certificate.certificateNo}.pdf`;

    await putObject({
      key: fileKey,
      body: pdf,
      contentType: "application/pdf",
      // Served through presigned URLs so revoking actually takes it away.
      isPrivate: true,
    });

    await certificate.update({
      status: EVENT_CERTIFICATE_STATUS.ISSUED,
      fileKey,
      issuedAt,
      templateSnapshot: {
        name: template.name,
        backgroundKey: template.backgroundKey,
        canvasWidth: template.canvasWidth,
        canvasHeight: template.canvasHeight,
        fields: template.fields,
      },
      lastError: null,
    });
  } catch (error) {
    await certificate.update({
      status: EVENT_CERTIFICATE_STATUS.FAILED,
      lastError: error.message?.slice(0, 1000) || "Unknown error",
    });

    logger.error("Certificate issue failed", {
      certificateId,
      error: error.message,
    });

    return { success: false, error: error.message };
  }

  // Past the point of no return for the artifact: the PDF exists and the row
  // says so. Everything below only affects `emailSentAt`.
  const emailResult = await sendCertificateEmail(certificate);

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
export const sendCertificateEmail = async (certificate) => {
  const template = await EventEmailTemplate.findOne({
    where: {
      eventId: certificate.eventId,
      type: EVENT_EMAIL_TEMPLATE_TYPE.CERTIFICATE,
    },
  });

  if (!template) {
    logger.warn("No certificate email template; certificate issued but not sent", {
      certificateNo: certificate.certificateNo,
    });
    return { success: false, error: "No certificate email template" };
  }

  const event = certificate.event
    || (await Event.findByPk(certificate.eventId, { attributes: ["eventTitle"] }));

  const variables = {
    name: capitalizeName(certificate.recipientName),
    recipientName: capitalizeName(certificate.recipientName),
    eventTitle: event?.eventTitle || "",
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
    // explicit: info@thegradient.co.in is a domain whose SPF authorises only
    // secureserver.net while its mail is hosted on Microsoft 365, with no DKIM
    // selectors published and DMARC at p=quarantine. Every message down that
    // path fails both checks and is quarantined by the recipient, which looks
    // exactly like this: the send reports success, `emailSentAt` is written,
    // and nobody receives anything.
    //
    // gradientlearnings.org is the identity that is actually set up — SES DKIM
    // verified and a custom MAIL FROM — so it aligns on both.
    fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    to: certificate.recipientEmail,
    subject: BODIES.CUSTOM(template.subject, variables),
    html,
  });

  if (result.success) {
    await certificate.update({ emailSentAt: new Date() });
  } else {
    logger.error("Certificate email failed", {
      certificateNo: certificate.certificateNo,
      error: result.error,
    });
  }

  return result;
};
