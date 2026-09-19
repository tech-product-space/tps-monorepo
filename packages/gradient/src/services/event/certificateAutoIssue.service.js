import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { EventCertificate, EventCertificateTemplate, EventEmailTemplate } = db;

import {
  EVENT_CERTIFICATE_APPROVED_VIA,
  EVENT_CERTIFICATE_STATUS,
} from "../../config/constants/eventCertificate.js";
import { EVENT_EMAIL_TEMPLATE_TYPE } from "../../config/constants/event.js";
import { resolveEventSettings } from "../../util/helpers/eventSettings.js";
import { generateCertificateNumber } from "../../util/helpers/certificateNumber.js";
import logger from "../../util/logger.js";
import { enqueueCertificateIssues } from "../../jobs/certificateIssueJob.js";
import { recipientsForFeedback } from "./certificateRecipients.service.js";

/**
 * Can this event issue a certificate without anyone touching the admin panel?
 *
 * Both halves are required, and the email is not the softer of the two: a
 * certificate that renders but never reaches anybody is worse than one that was
 * never made, because the row says Issued and nobody goes looking.
 *
 * Exported because the admin needs to show this *before* the event, while it
 * can still be fixed — see the readiness readout on the Settings tab.
 */
export const certificateReadiness = async (event) => {
  const settings = resolveEventSettings(event);

  const [template, emailTemplate] = await Promise.all([
    EventCertificateTemplate.findOne({
      where: { eventId: event.id },
      attributes: ["id", "name"],
    }),
    EventEmailTemplate.findOne({
      where: {
        eventId: event.id,
        type: EVENT_EMAIL_TEMPLATE_TYPE.CERTIFICATE,
      },
      attributes: ["id"],
    }),
  ]);

  const missing = [];
  if (!template) missing.push("template");
  if (!emailTemplate) missing.push("email");

  return {
    autoIssueCertificate: settings.autoIssueCertificate,
    hasTemplate: Boolean(template),
    hasEmailTemplate: Boolean(emailTemplate),
    missing,
    ready: missing.length === 0,
  };
};

/**
 * The auto trigger: a feedback submission earns certificates for the submitter
 * and every teammate they named, immediately.
 *
 * Three ways this does nothing, all of them normal:
 *
 *   off        the event has `autoIssueCertificate` switched off
 *   not_ready  no certificate template, or no certificate email
 *   issuing    with an empty recipient list (a guest with no email address)
 *
 * On `not_ready` **nothing at all is created**. The alternative — rendering the
 * PDFs and leaving them unsent until someone writes the email — was considered
 * and rejected: it produces Issued rows nobody sent, which reads like success
 * in every list that counts them. Leaving no trace means the admin's Recipients
 * dry run still shows the whole team as owed a certificate, which is true.
 *
 * Never throws. The feedback is already saved by the time this runs and a
 * failure here must not turn a successful submission into a 500 — the admin
 * path issues by hand and is the designed fallback, not an emergency.
 */
export const autoIssueForFeedback = async (feedback, event, submitter = null) => {
  try {
    const settings = resolveEventSettings(event);

    if (!settings.autoIssueCertificate) {
      return { status: "off", recipients: [] };
    }

    const readiness = await certificateReadiness(event);

    if (!readiness.ready) {
      logger.warn("Auto-issue skipped: event is not set up for certificates", {
        eventId: event.id,
        feedbackId: feedback.id,
        missing: readiness.missing,
      });

      return { status: "not_ready", missing: readiness.missing, recipients: [] };
    }

    const recipients = recipientsForFeedback(
      feedback,
      event.eventType,
      submitter,
    );

    if (!recipients.length) {
      return { status: "issuing", recipients: [] };
    }

    const emails = recipients.map((r) => r.email);

    // Anyone who already has a certificate for this event is left completely
    // alone — including a Pending row an admin created from a dry run. Their
    // certificate is the admin's to approve; a submission arriving later should
    // not quietly approve and send it on their behalf.
    const existing = await EventCertificate.findAll({
      where: { eventId: event.id, recipientEmail: { [Op.in]: emails } },
      attributes: ["recipientEmail"],
    });

    const held = new Set(existing.map((c) => c.recipientEmail));
    const fresh = recipients.filter((r) => !held.has(r.email));

    if (!fresh.length) {
      return {
        status: "issuing",
        recipients: recipients.map(publicRecipient),
        created: 0,
      };
    }

    // Straight to Approved: there is no admin in this path to approve them, and
    // that is the decision the setting encodes. `approvedBy` stays null, which
    // is how the admin table tells an auto certificate from a hand-approved one.
    await EventCertificate.bulkCreate(
      fresh.map((recipient) => ({
        eventId: event.id,
        guestId: recipient.guestId,
        certificateNo: generateCertificateNumber(),
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        source: recipient.source,
        sourceFeedbackId: recipient.sourceFeedbackId,
        status: EVENT_CERTIFICATE_STATUS.APPROVED,
        approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.AUTO,
        approvedBy: null,
        approvedAt: new Date(),
      })),
      // Two teammates submitting within the same second would otherwise collide
      // on the (eventId, recipientEmail) unique index and fail the whole batch.
      { ignoreDuplicates: true },
    );

    // Read the ids back rather than trusting what bulkCreate returned: with
    // ON CONFLICT DO NOTHING, a skipped row still comes back as an instance,
    // and enqueuing its null id would burn a job on nothing.
    const queueable = await EventCertificate.findAll({
      where: {
        eventId: event.id,
        recipientEmail: { [Op.in]: fresh.map((r) => r.email) },
        status: EVENT_CERTIFICATE_STATUS.APPROVED,
        approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.AUTO,
      },
      attributes: ["id"],
    });

    await enqueueCertificateIssues(queueable.map((c) => c.id));

    return {
      status: "issuing",
      recipients: recipients.map(publicRecipient),
      created: queueable.length,
    };
  } catch (error) {
    logger.error("Auto-issue failed", {
      eventId: event?.id,
      feedbackId: feedback?.id,
      error: error.message,
    });

    return { status: "error", recipients: [] };
  }
};

/**
 * What the submitter is allowed to see back.
 *
 * Names and addresses only — these are the ones they typed on the review step a
 * moment ago, so echoing them closes the loop and is their last chance to spot
 * a wrong address. Ids and statuses are nobody's business on a public route.
 */
const publicRecipient = (recipient) => ({
  name: recipient.name,
  email: recipient.email,
  source: recipient.source,
});
