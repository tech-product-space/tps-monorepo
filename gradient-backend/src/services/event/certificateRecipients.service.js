import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { EventGuest, EventFeedback, EventCertificate } = db;

import { EVENT_GUEST_STATUS } from "../../config/constants/eventGuest.js";
import { EVENT_CERTIFICATE_SOURCE } from "../../config/constants/eventCertificate.js";
import { readTeammates } from "./feedbackSchema.service.js";

const normaliseEmail = (value) => String(value || "").trim().toLowerCase();

/**
 * Everyone a single submission earns a certificate for: the person who
 * submitted, plus each teammate they named.
 *
 * Read through `readTeammates`, so an address an admin has since corrected
 * resolves to the corrected one — the raw `responses` still holds the typo on
 * purpose, and reading it directly is how a fixed typo comes back.
 *
 * `submitter` is for the callers that already hold the guest — the submit
 * handler resolved one to save the feedback at all, and re-querying it just to
 * satisfy an `include` would be a wasted round trip. Everyone else passes the
 * included association.
 */
export const recipientsForFeedback = (feedback, eventType, submitter = null) => {
  const out = [];
  const seen = new Set();

  const guest = submitter || feedback.guest;
  const submitterEmail = normaliseEmail(guest?.email);

  // A guest with no email cannot be sent anything. Nullable on the model, so
  // this is reachable, and dropping them silently is what TPS did.
  if (submitterEmail && guest?.name) {
    seen.add(submitterEmail);
    out.push({
      name: guest.name,
      email: submitterEmail,
      source: EVENT_CERTIFICATE_SOURCE.ATTENDEE,
      guestId: guest.id,
      sourceFeedbackId: feedback.id,
      namedBy: null,
    });
  }

  for (const teammate of readTeammates(feedback, eventType)) {
    // The submitter naming themselves is common; attendee wins.
    if (seen.has(teammate.email)) continue;
    seen.add(teammate.email);

    out.push({
      name: teammate.name,
      email: teammate.email,
      source: EVENT_CERTIFICATE_SOURCE.TEAMMATE,
      guestId: null,
      sourceFeedbackId: feedback.id,
      namedBy: guest?.name || null,
    });
  }

  return out;
};

/**
 * Dry run for the whole event: who would get a certificate, and what the admin
 * should look at before committing.
 *
 * Nothing is excluded for being unregistered. `registered: false` is a flag so
 * a typo'd address gets spotted, not a filter — a teammate who did the work
 * earns a certificate whether or not they ever filled in a registration form.
 */
export const resolveEventRecipients = async (event, { requireFeedback = true } = {}) => {
  const feedbacks = await EventFeedback.findAll({
    where: { eventId: event.id },
    include: [
      {
        model: EventGuest,
        as: "guest",
        attributes: ["id", "name", "email", "status"],
      },
    ],
    order: [["submittedAt", "ASC"]],
  });

  const byEmail = new Map();

  for (const feedback of feedbacks) {
    // A submission from someone later declined should not mint certificates for
    // their whole team.
    if (feedback.guest?.status === EVENT_GUEST_STATUS.DECLINED) continue;

    for (const recipient of recipientsForFeedback(feedback, event.eventType)) {
      const existing = byEmail.get(recipient.email);

      // Attendee beats teammate: if someone submitted their own feedback AND was
      // named by a teammate, the row that carries their guestId is the useful one.
      if (!existing || existing.source === EVENT_CERTIFICATE_SOURCE.TEAMMATE) {
        byEmail.set(recipient.email, recipient);
      }
    }
  }

  // Everyone approved for the event, whether or not they submitted. Only used
  // when the caller does not require feedback — a Workshop where the admin
  // decided attendance alone earns a certificate.
  if (!requireFeedback) {
    const guests = await EventGuest.findAll({
      where: { eventId: event.id, status: EVENT_GUEST_STATUS.APPROVED },
      attributes: ["id", "name", "email"],
    });

    for (const guest of guests) {
      const email = normaliseEmail(guest.email);
      if (!email || !guest.name || byEmail.has(email)) continue;

      byEmail.set(email, {
        name: guest.name,
        email,
        source: EVENT_CERTIFICATE_SOURCE.ATTENDEE,
        guestId: guest.id,
        sourceFeedbackId: null,
        namedBy: null,
      });
    }
  }

  const recipients = [...byEmail.values()];
  const emails = recipients.map((r) => r.email);

  // Two lookups, both batched — resolving these per recipient is how a 200-guest
  // event turns into 400 queries.
  const [guests, certificates] = await Promise.all([
    emails.length
      ? EventGuest.findAll({
          where: { eventId: event.id, email: { [Op.in]: emails } },
          attributes: ["id", "name", "email", "status"],
        })
      : [],
    emails.length
      ? EventCertificate.findAll({
          where: { eventId: event.id, recipientEmail: { [Op.in]: emails } },
          attributes: ["id", "recipientEmail", "certificateNo", "status"],
        })
      : [],
  ]);

  const guestByEmail = new Map(
    guests.map((g) => [normaliseEmail(g.email), g]),
  );
  const certificateByEmail = new Map(
    certificates.map((c) => [c.recipientEmail, c]),
  );

  return recipients.map((recipient) => {
    const guest = guestByEmail.get(recipient.email);
    const certificate = certificateByEmail.get(recipient.email);

    return {
      ...recipient,
      // A teammate who registered later gets their guest attached here, so the
      // certificate shows against them in admin views.
      guestId: recipient.guestId || guest?.id || null,
      registered: Boolean(guest),
      existingCertificate: certificate
        ? {
            id: certificate.id,
            certificateNo: certificate.certificateNo,
            status: certificate.status,
          }
        : null,
    };
  });
};
