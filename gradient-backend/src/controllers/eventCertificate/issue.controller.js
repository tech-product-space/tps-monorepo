import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { Event, EventCertificate, EventFeedback, EventGuest } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { generateCertificateNumber } from "../../util/helpers/certificateNumber.js";
import {
  EVENT_CERTIFICATE_APPROVED_VIA,
  EVENT_CERTIFICATE_SOURCE,
  EVENT_CERTIFICATE_STATUS,
} from "../../config/constants/eventCertificate.js";
import { EVENT_GUEST_STATUS } from "../../config/constants/eventGuest.js";
import {
  recipientsForFeedback,
  resolveEventRecipients,
} from "../../services/event/certificateRecipients.service.js";
import { certificateReadiness } from "../../services/event/certificateAutoIssue.service.js";
import { sendCertificateEmail } from "../../services/event/certificateIssue.service.js";
import {
  enqueueCertificateIssue,
  enqueueCertificateIssues,
} from "../../jobs/certificateIssueJob.js";

const normaliseEmail = (value) => String(value || "").trim().toLowerCase();

/**
 * How long a certificate may sit on Approved before Generate treats it as
 * stalled and re-queues it.
 *
 * A render is seconds — canvas, one S3 put, one send — and the queue picks a job
 * up within a poll interval. Five minutes is far past any healthy case while
 * still short enough that an admin who notices a stuck row can fix it in the
 * same sitting rather than filing a ticket.
 */
const APPROVED_STALL_MS = 5 * 60 * 1000;

/**
 * GET /events/certificates/admin/:eventId/recipients
 *
 * Dry run. Creates nothing — this is what the admin looks at before committing,
 * and the only chance to spot a typo'd teammate address before certificates go
 * out under it.
 */
export const getRecipients = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const requireFeedback = req.query.requireFeedback !== "false";

  const event = await Event.findByPk(eventId, {
    attributes: ["id", "eventTitle", "eventType"],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const recipients = await resolveEventRecipients(event, { requireFeedback });

  return res.status(200).json({
    data: {
      recipients,
      summary: {
        total: recipients.length,
        unregistered: recipients.filter((r) => !r.registered).length,
        alreadyIssued: recipients.filter((r) => r.existingCertificate).length,
        teammates: recipients.filter(
          (r) => r.source === EVENT_CERTIFICATE_SOURCE.TEAMMATE,
        ).length,
      },
    },
  });
});

/**
 * GET /events/certificates/admin/:eventId/readiness
 *
 * "If someone submits feedback right now, does a certificate actually go out?"
 *
 * Cheap enough to poll, and worth surfacing in more than one place — auto-issue
 * being on while the certificate email is missing is silent otherwise, and the
 * moment you find out is when an attendee asks where their certificate is.
 */
export const getReadiness = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findByPk(eventId, {
    attributes: ["id", "settings", "canAcceptResponse"],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const readiness = await certificateReadiness(event);

  return res.status(200).json({
    data: {
      ...readiness,
      canAcceptResponse: event.canAcceptResponse,
      // The one combination that quietly does nothing: switched on, form open,
      // and nothing to send. Everything else is either working or obviously off.
      willAutoIssue: readiness.autoIssueCertificate && readiness.ready,
    },
  });
});

/**
 * POST /events/certificates/admin/:eventId/recipients
 *
 * Creates Pending rows for the recipients the admin kept. Send nothing yet —
 * approving is a separate, deliberate step.
 */
export const createRecipients = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { emails } = req.body;

  const event = await Event.findByPk(eventId, {
    attributes: ["id", "eventTitle", "eventType"],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const resolved = await resolveEventRecipients(event, {
    requireFeedback: req.body.requireFeedback !== false,
  });

  // No list means "all of them"; a list means the admin unchecked some.
  const wanted = Array.isArray(emails)
    ? new Set(emails.map(normaliseEmail))
    : null;

  const selected = resolved.filter(
    (r) => !r.existingCertificate && (!wanted || wanted.has(r.email)),
  );

  if (!selected.length) {
    return res.status(200).json({
      message: "Nothing new to create",
      data: { created: 0 },
    });
  }

  const rows = selected.map((recipient) => ({
    eventId,
    guestId: recipient.guestId,
    certificateNo: generateCertificateNumber(),
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    source: recipient.source,
    sourceFeedbackId: recipient.sourceFeedbackId,
    status: EVENT_CERTIFICATE_STATUS.PENDING,
  }));

  // ignoreDuplicates leans on the (eventId, recipientEmail) unique constraint,
  // so two admins resolving at once cannot mint two certificates for one person.
  const created = await EventCertificate.bulkCreate(rows, {
    ignoreDuplicates: true,
  });

  return res.status(201).json({
    message: "Recipients created",
    data: { created: created.length },
  });
});

/**
 * PATCH /events/certificates/admin/:eventId/approve
 *
 * `{ certificateIds: [...] }` or `{ all: true }`. Approving queues the work —
 * the job does the rendering, so this returns immediately even for a few
 * hundred recipients.
 */
export const approveCertificates = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { certificateIds, all } = req.body;
  const adminId = req.admin?.id || null;

  const where = {
    eventId,
    // Failed rows are re-approvable; Issued and Revoked are not.
    status: {
      [Op.in]: [EVENT_CERTIFICATE_STATUS.PENDING, EVENT_CERTIFICATE_STATUS.FAILED],
    },
  };

  if (!all) {
    if (!Array.isArray(certificateIds) || !certificateIds.length) {
      return res.status(400).json({
        message: "Provide certificateIds, or set all: true",
      });
    }
    where.id = { [Op.in]: certificateIds };
  }

  const certificates = await EventCertificate.findAll({
    where,
    attributes: ["id"],
  });

  if (!certificates.length) {
    return res.status(200).json({
      message: "Nothing to approve",
      data: { approved: 0 },
    });
  }

  const ids = certificates.map((c) => c.id);

  await EventCertificate.update(
    {
      status: EVENT_CERTIFICATE_STATUS.APPROVED,
      approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.ADMIN,
      approvedBy: adminId,
      approvedAt: new Date(),
    },
    { where: { id: { [Op.in]: ids } } },
  );

  const queue = await enqueueCertificateIssues(ids);

  return res.status(200).json({
    message: "Certificates approved and queued",
    data: { approved: ids.length, ...queue },
  });
});

/**
 * POST /events/certificates/admin/:eventId/feedback/issue
 *
 * `{ feedbackIds: [...] }` or `{ all: true }` — the Feedback tab's Generate
 * button, one row or many.
 *
 * Collapses what used to be three steps (resolve recipients → create Pending →
 * approve) into the single thing an admin actually means: *this response earned
 * certificates, send them.* The three-step path still exists for the event-wide
 * dry run, where reviewing the list before committing is the point.
 *
 * Rows land on `Approved` directly, credited to the admin who pressed it —
 * `approvedVia: Admin` with a real `approvedBy`, which is what distinguishes
 * these from the ones auto-issue creates with a null approver.
 */
export const issueForFeedbacks = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { feedbackIds, all } = req.body;
  const adminId = req.admin?.id || null;

  const event = await Event.findByPk(eventId, {
    attributes: ["id", "eventTitle", "eventType"],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  if (!all && (!Array.isArray(feedbackIds) || !feedbackIds.length)) {
    return res
      .status(400)
      .json({ message: "Provide feedbackIds, or set all: true" });
  }

  // Without a design every queued job fails, and the admin finds out one Failed
  // row at a time. A missing email is not fatal in the same way — the PDF is
  // still real, and `retry` sends it once the email exists.
  const readiness = await certificateReadiness(event);

  if (!readiness.hasTemplate) {
    return res.status(400).json({
      message: "Design the certificate on the Certificates tab first.",
    });
  }

  const where = { eventId };
  if (!all) where.id = { [Op.in]: feedbackIds };

  const feedbacks = await EventFeedback.findAll({
    where,
    include: [
      {
        model: EventGuest,
        as: "guest",
        attributes: ["id", "name", "email", "status"],
      },
    ],
  });

  if (!feedbacks.length) {
    return res.status(404).json({ message: "No responses found" });
  }

  // A submission from someone later declined must not mint certificates for
  // their whole team. Counted rather than silently dropped, so a Generate that
  // does nothing can say why.
  const eligible = feedbacks.filter(
    (feedback) => feedback.guest?.status !== EVENT_GUEST_STATUS.DECLINED,
  );

  const skippedDeclined = feedbacks.length - eligible.length;

  const byEmail = new Map();

  for (const feedback of eligible) {
    for (const recipient of recipientsForFeedback(feedback, event.eventType)) {
      const existing = byEmail.get(recipient.email);

      // Attendee beats teammate, as in the event-wide resolve: two responses can
      // name the same person, and the row carrying their guestId is the useful
      // one.
      if (!existing || existing.source === EVENT_CERTIFICATE_SOURCE.TEAMMATE) {
        byEmail.set(recipient.email, recipient);
      }
    }
  }

  const recipients = [...byEmail.values()];

  if (!recipients.length) {
    return res.status(200).json({
      message: "There is nobody to issue to on those responses.",
      data: { created: 0, reapproved: 0, queued: 0, skipped: 0, skippedDeclined },
    });
  }

  const emails = recipients.map((r) => r.email);

  const existing = await EventCertificate.findAll({
    where: { eventId, recipientEmail: { [Op.in]: emails } },
    attributes: ["id", "recipientEmail", "status", "approvedAt", "updatedAt"],
  });

  const held = new Set(existing.map((c) => c.recipientEmail));
  const fresh = recipients.filter((r) => !held.has(r.email));

  // Pending is a recipient somebody created from the dry run and never
  // approved; Failed is one whose render broke. Both are exactly what this
  // button is for. Issued, Issuing and Revoked are left alone.
  //
  // Approved is the interesting case. Normally it means "queued seconds ago,
  // about to render", and re-queueing it is how one person gets two emails. But
  // if the job is lost — the queue was down, the worker was restarted mid-flight,
  // or a bad job definition killed it on arrival — the row sits on Approved with
  // nothing coming for it, and no button on either tab can reach it. So a row
  // that has been Approved longer than any render plausibly takes is treated as
  // stalled and re-queued. The claim inside `issueCertificate` is a conditional
  // UPDATE, so even if a real render *is* still running, only one of the two
  // wins and the loser stops.
  const stalledBefore = Date.now() - APPROVED_STALL_MS;

  const reapprovable = existing
    .filter((c) => {
      if (
        [
          EVENT_CERTIFICATE_STATUS.PENDING,
          EVENT_CERTIFICATE_STATUS.FAILED,
        ].includes(c.status)
      ) {
        return true;
      }

      if (c.status !== EVENT_CERTIFICATE_STATUS.APPROVED) return false;

      const since = c.approvedAt || c.updatedAt;
      return !since || new Date(since).getTime() < stalledBefore;
    })
    .map((c) => c.id);

  const approval = {
    status: EVENT_CERTIFICATE_STATUS.APPROVED,
    approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.ADMIN,
    approvedBy: adminId,
    approvedAt: new Date(),
  };

  if (fresh.length) {
    // ignoreDuplicates leans on the (eventId, recipientEmail) unique index, so
    // two admins pressing Generate at once cannot mint two certificates for one
    // person.
    await EventCertificate.bulkCreate(
      fresh.map((recipient) => ({
        eventId,
        guestId: recipient.guestId,
        certificateNo: generateCertificateNumber(),
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        source: recipient.source,
        sourceFeedbackId: recipient.sourceFeedbackId,
        ...approval,
      })),
      { ignoreDuplicates: true },
    );
  }

  if (reapprovable.length) {
    await EventCertificate.update(
      { ...approval, lastError: null },
      { where: { id: { [Op.in]: reapprovable } } },
    );
  }

  // Read the created ids back rather than trusting bulkCreate: with ON CONFLICT
  // DO NOTHING a skipped row still comes back as an instance, and enqueueing its
  // null id burns a job on nothing.
  const created = fresh.length
    ? await EventCertificate.findAll({
        where: {
          eventId,
          recipientEmail: { [Op.in]: fresh.map((r) => r.email) },
        },
        attributes: ["id"],
      })
    : [];

  const ids = [...new Set([...created.map((c) => c.id), ...reapprovable])];

  await enqueueCertificateIssues(ids);

  req.activity?.set({
    entityLabel: event.eventTitle,
    metadata: { affectedCount: ids.length, responses: eligible.length },
  });

  return res.status(200).json({
    message: ids.length
      ? `${ids.length} certificate${ids.length === 1 ? "" : "s"} queued`
      : "Everyone on those responses already has a certificate",
    data: {
      created: created.length,
      reapproved: reapprovable.length,
      queued: ids.length,
      skipped: existing.length - reapprovable.length,
      skippedDeclined,
    },
  });
});

/**
 * GET /events/certificates/admin/:eventId/certificates?search=
 *
 * The Certificates tab is a lookup: find one certificate, by number or by whose
 * name is on it. Issuing happens on the Feedback tab, against the response that
 * earned it.
 */
export const listCertificates = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { status } = req.query;
  const { page, limit, offset } = getPaginationParams(req.query);
  const search = String(req.query.search || "").trim();

  const where = { eventId };
  if (status) where.status = status;

  if (search) {
    const like = `%${search}%`;

    where[Op.or] = [
      { certificateNo: { [Op.iLike]: like } },
      { recipientName: { [Op.iLike]: like } },
      { recipientEmail: { [Op.iLike]: like } },
    ];
  }

  const { rows, count } = await EventCertificate.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  // Counts come from the table rather than being tracked as the admin acts —
  // TPS returned hand-maintained arrays it never populated, so the UI could not
  // tell what had actually happened.
  const grouped = await EventCertificate.findAll({
    where: { eventId },
    attributes: [
      "status",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    group: ["status"],
    raw: true,
  });

  const counts = grouped.reduce(
    (acc, row) => ({ ...acc, [row.status]: Number(row.count) }),
    {},
  );

  return res.status(200).json({
    data: rows,
    meta: getMeta(count, page, limit),
    counts,
  });
});

/**
 * POST /events/certificates/admin/certificates/:id/retry
 *
 * Re-queues a Failed row. Also covers the Issued-but-never-emailed case, where
 * only the mail needs another go — the PDF is fine and must not be re-rendered.
 */
export const retryCertificate = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const certificate = await EventCertificate.findByPk(id, {
    include: [{ model: Event, as: "event", attributes: ["id", "eventTitle"] }],
  });

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  if (
    certificate.status === EVENT_CERTIFICATE_STATUS.ISSUED &&
    !certificate.emailSentAt
  ) {
    const result = await sendCertificateEmail(certificate);

    return res.status(200).json({
      message: result.success ? "Email sent" : "Email failed",
      data: { emailed: result.success, error: result.error || null },
    });
  }

  // A row still on Approved long after it was queued has lost its job — see
  // APPROVED_STALL_MS. Retrying it is the single-row counterpart of pressing
  // Generate again on the Feedback tab, and the claim inside `issueCertificate`
  // means a render that somehow is still running keeps the row.
  const stalled =
    certificate.status === EVENT_CERTIFICATE_STATUS.APPROVED &&
    (() => {
      const since = certificate.approvedAt || certificate.updatedAt;
      return !since || Date.now() - new Date(since).getTime() > APPROVED_STALL_MS;
    })();

  if (certificate.status !== EVENT_CERTIFICATE_STATUS.FAILED && !stalled) {
    return res.status(400).json({
      message: `Cannot retry a certificate that is ${certificate.status}`,
    });
  }

  await enqueueCertificateIssue(certificate.id);

  return res.status(200).json({ message: "Certificate re-queued" });
});

/**
 * PATCH /events/certificates/admin/certificates/:id/revoke
 *
 * Withdraws a certificate. This actually works because the S3 object is private
 * — the verify endpoint stops minting URLs and the file becomes unreachable.
 */
export const revokeCertificate = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const certificate = await EventCertificate.findByPk(id);

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  await certificate.update({ status: EVENT_CERTIFICATE_STATUS.REVOKED });

  return res.status(200).json({ message: "Certificate revoked" });
});

/**
 * PATCH /events/certificates/admin/certificates/:id/restore
 *
 * Undo a revoke.
 *
 * Revoking never deletes the PDF — it only stops the download resolving — so
 * putting the row back is genuinely reversible, and the certificate number the
 * recipient already has keeps working. That is the whole reason revoke is a
 * status and not a delete.
 *
 * Where it goes back to depends on whether it was ever rendered: a row revoked
 * after issuing has a file to return to, one revoked before that has nothing
 * yet and lands on Pending for the admin to send.
 */
export const restoreCertificate = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const certificate = await EventCertificate.findByPk(id);

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  if (certificate.status !== EVENT_CERTIFICATE_STATUS.REVOKED) {
    return res.status(400).json({
      message: `That certificate is ${certificate.status}, not revoked.`,
    });
  }

  // A replacement was minted when this one was revoked through a correction.
  // Restoring the original would leave two live certificates for one person,
  // which is exactly what the unique index on (eventId, recipientEmail) exists
  // to prevent — and the replacement carries the corrected name.
  const replacement = await EventCertificate.findOne({
    where: { replacesCertificateId: certificate.id },
    attributes: ["certificateNo", "status"],
  });

  if (replacement && replacement.status !== EVENT_CERTIFICATE_STATUS.REVOKED) {
    return res.status(409).json({
      message: `This one was replaced by ${replacement.certificateNo}. Revoke that first if you want this one back.`,
    });
  }

  const restored = certificate.fileKey
    ? EVENT_CERTIFICATE_STATUS.ISSUED
    : EVENT_CERTIFICATE_STATUS.PENDING;

  await certificate.update({ status: restored });

  return res.status(200).json({
    message:
      restored === EVENT_CERTIFICATE_STATUS.ISSUED
        ? "Certificate restored — it can be downloaded again"
        : "Certificate restored as Pending — send it when you are ready",
    data: { status: restored },
  });
});

/**
 * PATCH /events/certificates/admin/certificates/:id/recipient
 *
 * Correct a typo'd name or email, on request. **Sends nothing** — a correction
 * is a deliberate act, and the admin issues afterwards.
 *
 * Two branches, because the situations genuinely differ:
 *
 *   Pending / Failed → update in place, keep the number
 *   Issued           → revoke, and create a replacement with a new number
 *
 * Rewriting the name behind a live certificate number would silently change
 * what a recruiter sees on a page already shared. Revoke-and-reissue leaves a
 * trail instead.
 */
export const correctRecipient = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { name, email, note } = req.body;
  const adminId = req.admin?.id || null;

  if (!name && !email) {
    return res.status(400).json({ message: "Provide a name or an email" });
  }

  const certificate = await EventCertificate.findByPk(id);

  if (!certificate) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  const nextName = name?.trim() || certificate.recipientName;
  const nextEmail = email ? normaliseEmail(email) : certificate.recipientEmail;

  // The correction has to survive the next resolve, or the typo in `responses`
  // comes straight back as a brand-new recipient.
  if (certificate.sourceFeedbackId && nextEmail !== certificate.recipientEmail) {
    const feedback = await EventFeedback.findByPk(certificate.sourceFeedbackId);

    if (feedback) {
      await feedback.update({
        corrections: {
          ...(feedback.corrections || {}),
          [certificate.recipientEmail]: {
            email: nextEmail,
            name: nextName,
            correctedBy: adminId,
            correctedAt: new Date().toISOString(),
            note: note || null,
          },
        },
      });
    }
  }

  if (certificate.status === EVENT_CERTIFICATE_STATUS.ISSUED) {
    await certificate.update({ status: EVENT_CERTIFICATE_STATUS.REVOKED });

    const replacement = await EventCertificate.create({
      eventId: certificate.eventId,
      guestId: certificate.guestId,
      certificateNo: generateCertificateNumber(),
      recipientName: nextName,
      recipientEmail: nextEmail,
      source: certificate.source,
      sourceFeedbackId: certificate.sourceFeedbackId,
      status: EVENT_CERTIFICATE_STATUS.PENDING,
      approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.CORRECTION,
      replacesCertificateId: certificate.id,
    });

    return res.status(200).json({
      message:
        "Previous certificate revoked and a replacement created. Approve it to send.",
      data: { id: replacement.id, certificateNo: replacement.certificateNo },
    });
  }

  await certificate.update({
    recipientName: nextName,
    recipientEmail: nextEmail,
    status: EVENT_CERTIFICATE_STATUS.PENDING,
    approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.CORRECTION,
    lastError: null,
  });

  return res.status(200).json({
    message: "Recipient corrected. Approve it to send.",
    data: { id: certificate.id },
  });
});
