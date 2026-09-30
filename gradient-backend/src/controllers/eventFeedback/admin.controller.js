import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { Event, EventGuest, EventFeedback, EventCertificate } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import {
  FEEDBACK_FIELD_TYPE,
  getFeedbackForm,
  getTeammateField,
} from "../../config/constants/eventFeedbackForms.js";
import { readTeammates } from "../../services/event/feedbackSchema.service.js";
import { recipientsForFeedback } from "../../services/event/certificateRecipients.service.js";
import { EVENT_CERTIFICATE_STATUS } from "../../config/constants/eventCertificate.js";

const guestInclude = {
  model: EventGuest,
  as: "guest",
  attributes: [
    "id",
    "name",
    "email",
    "phone",
    "attendeeType",
    "status",
    "additionalData",
  ],
};

/**
 * Match a response by the people on it, not by what they wrote.
 *
 * A teammate only ever exists inside a submission, so searching the submitter
 * alone would answer "did Priya get a certificate?" with nothing whenever Priya
 * was named by someone else. The JSONB arm covers that.
 *
 * `field.key` is interpolated because it comes from our own form definitions
 * (`eventFeedbackForms.js`), never from the request. The search term itself is
 * bound, which is the half an attacker controls.
 */
const searchClause = (search, eventType) => {
  const like = `%${search}%`;

  const clauses = [
    { "$guest.name$": { [Op.iLike]: like } },
    { "$guest.email$": { [Op.iLike]: like } },
  ];

  const field = getTeammateField(eventType);

  if (field) {
    clauses.push(
      db.sequelize.literal(`EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof("EventFeedback"."responses" -> '${field.key}') = 'array'
              THEN "EventFeedback"."responses" -> '${field.key}'
            ELSE '[]'::jsonb
          END
        ) AS teammate
        WHERE teammate ->> 'name' ILIKE :search
           OR teammate ->> 'email' ILIKE :search
      )`),
    );
  }

  return { where: { [Op.or]: clauses }, replacements: { search: like } };
};

const SUMMARY_BUCKETS = {
  [EVENT_CERTIFICATE_STATUS.PENDING]: "pending",
  [EVENT_CERTIFICATE_STATUS.APPROVED]: "inProgress",
  [EVENT_CERTIFICATE_STATUS.ISSUING]: "inProgress",
  [EVENT_CERTIFICATE_STATUS.ISSUED]: "issued",
  [EVENT_CERTIFICATE_STATUS.FAILED]: "failed",
  [EVENT_CERTIFICATE_STATUS.REVOKED]: "revoked",
};

/**
 * GET /events/feedback/admin/:eventId?search=
 *
 * Every response, with the certificate state of everyone on it. The state is
 * attached here rather than left to the Certificates tab because this is the
 * screen an admin issues from — a row that cannot say whether its team already
 * has certificates is a row you cannot safely press Generate on.
 */
export const listFeedbacks = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { page, limit, offset } = getPaginationParams(req.query);
  const search = String(req.query.search || "").trim();

  const event = await Event.findByPk(eventId, {
    attributes: ["id", "eventTitle", "eventType"],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const matcher = search ? searchClause(search, event.eventType) : null;

  const { rows, count } = await EventFeedback.findAndCountAll({
    where: { eventId, ...(matcher?.where || {}) },
    include: [guestInclude],
    order: [["submittedAt", "DESC"]],
    limit,
    offset,
    ...(matcher ? { replacements: matcher.replacements } : {}),
  });

  // One query for the whole page. Resolving per response is how a 50-row page
  // becomes 50 round trips.
  const recipientsByFeedback = new Map(
    rows.map((row) => [row.id, recipientsForFeedback(row, event.eventType)]),
  );

  const emails = [
    ...new Set([...recipientsByFeedback.values()].flat().map((r) => r.email)),
  ];

  const certificates = emails.length
    ? await EventCertificate.findAll({
        where: { eventId, recipientEmail: { [Op.in]: emails } },
        attributes: [
          "id",
          "recipientEmail",
          "certificateNo",
          "status",
          "emailSentAt",
        ],
      })
    : [];

  const certificateByEmail = new Map(
    certificates.map((c) => [c.recipientEmail, c]),
  );

  const data = rows.map((row) => {
    const recipients = (recipientsByFeedback.get(row.id) || []).map(
      (recipient) => {
        const certificate = certificateByEmail.get(recipient.email);

        return {
          name: recipient.name,
          email: recipient.email,
          source: recipient.source,
          namedBy: recipient.namedBy,
          certificate: certificate
            ? {
                id: certificate.id,
                certificateNo: certificate.certificateNo,
                status: certificate.status,
                emailSentAt: certificate.emailSentAt,
              }
            : null,
        };
      },
    );

    const summary = {
      total: recipients.length,
      pending: 0,
      inProgress: 0,
      issued: 0,
      failed: 0,
      revoked: 0,
      none: 0,
    };

    for (const recipient of recipients) {
      const bucket = recipient.certificate
        ? SUMMARY_BUCKETS[recipient.certificate.status]
        : "none";
      if (bucket) summary[bucket] += 1;
    }

    return {
      ...row.get({ plain: true }),
      // Teammates are read through the helper so admin-corrected addresses show
      // the corrected value, not the typo that is still sitting in `responses`.
      teammates: readTeammates(row, event.eventType),
      // The submitter and every teammate, each with whatever certificate they
      // already have. This is what the expanded row draws.
      recipients,
      certificateSummary: summary,
    };
  });

  return res.status(200).json({
    data,
    meta: getMeta(count, page, limit),
    form: getFeedbackForm(event.eventType),
  });
});

/**
 * GET /events/feedback/admin/:eventId/export
 *
 * Flat rows plus the column list. Columns come from the form definition rather
 * than from a union of whatever keys happen to appear in the data, so the sheet
 * has the same shape every time — including for questions nobody answered.
 */
export const exportFeedbacks = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findByPk(eventId, {
    attributes: ["id", "eventTitle", "eventType"],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const form = getFeedbackForm(event.eventType);

  if (!form) {
    return res
      .status(400)
      .json({ message: "This event type does not collect feedback." });
  }

  const feedbacks = await EventFeedback.findAll({
    where: { eventId },
    include: [guestInclude],
    order: [["submittedAt", "DESC"]],
  });

  const certificates = await EventCertificate.findAll({
    where: { eventId },
    attributes: ["recipientEmail", "certificateNo", "status", "issuedAt"],
  });

  const certificateByEmail = new Map(
    certificates.map((c) => [c.recipientEmail, c]),
  );

  const scalarFields = form.fields.filter(
    (f) => f.type !== FEEDBACK_FIELD_TYPE.GROUP,
  );
  const groupFields = form.fields.filter(
    (f) => f.type === FEEDBACK_FIELD_TYPE.GROUP,
  );

  const columns = [
    "Name",
    "Email",
    "Phone",
    "Attendee type",
    "Submitted at",
    ...scalarFields.map((f) => f.label),
    ...groupFields.map((f) => f.label),
    "Certificate no",
    "Certificate status",
  ];

  const rows = feedbacks.map((feedback) => {
    const guest = feedback.guest;
    const certificate = certificateByEmail.get(
      String(guest?.email || "").toLowerCase(),
    );

    const row = {
      Name: guest?.name || "",
      Email: guest?.email || "",
      Phone: guest?.phone || "",
      "Attendee type": guest?.attendeeType || "",
      "Submitted at": feedback.submittedAt,
    };

    for (const field of scalarFields) {
      const value = feedback.responses?.[field.key];
      row[field.label] = Array.isArray(value) ? value.join(", ") : (value ?? "");
    }

    // Flattened to one cell — a spreadsheet cannot hold a nested list, and one
    // column per possible teammate would be mostly empty.
    for (const field of groupFields) {
      row[field.label] = readTeammates(feedback, event.eventType)
        .map((t) => `${t.name} <${t.email}>`)
        .join("; ");
    }

    row["Certificate no"] = certificate?.certificateNo || "";
    row["Certificate status"] = certificate?.status || "Not created";

    return row;
  });

  return res.status(200).json({
    data: {
      eventTitle: event.eventTitle,
      eventType: event.eventType,
      columns,
      rows,
    },
  });
});
