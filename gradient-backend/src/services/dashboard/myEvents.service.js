import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { Event, EventGuest, EventFeedback, EventCertificate } = db;

import {
  getFeedbackForm,
  getTeammateField,
} from "../../config/constants/eventFeedbackForms.js";
import { EVENT_CERTIFICATE_STATUS } from "../../config/constants/eventCertificate.js";

const EVENT_ATTRIBUTES = [
  "id",
  "eventTitle",
  "eventSubtitle",
  "eventSlug",
  "eventType",
  "eventStartDate",
  "eventEndDate",
  "eventStartTime",
  "eventEndTime",
  "eventCreativeUrl",
  "locationType",
  "canAcceptResponse",
];

const normaliseEmail = (value) => String(value || "").trim().toLowerCase();

/**
 * Feedback submitted by a *teammate*, on this person's behalf.
 *
 * On team events one submission covers the whole team, so someone whose
 * teammate already sent it in has no `EventFeedback` row of their own. Without
 * this their card would say "Give feedback", and the link would take them to a
 * page telling them their team already did — a dead end we can see coming.
 *
 * The teammate field key comes from the form definitions rather than being
 * written out here. Both team forms happen to share one key today, so this is
 * one query; grouping by key keeps it one query if that ever stops being true.
 */
const teamSubmissionsByEvent = async (events, email) => {
  const byKey = new Map();

  for (const event of events) {
    const field = getTeammateField(event.eventType);
    if (!field) continue;

    if (!byKey.has(field.key)) byKey.set(field.key, []);
    byKey.get(field.key).push(event.id);
  }

  if (!byKey.size || !email) return new Map();

  const results = await Promise.all(
    [...byKey.entries()].map(([key, eventIds]) =>
      EventFeedback.findAll({
        where: {
          eventId: { [Op.in]: eventIds },
          // Parameterised JSONB containment — never interpolate an address
          // into SQL, which is the injection hole in the TPS implementation.
          responses: { [Op.contains]: { [key]: [{ email }] } },
        },
        attributes: ["id", "eventId", "submittedAt"],
        include: [
          { model: EventGuest, as: "guest", attributes: ["name"] },
        ],
      }),
    ),
  );

  return new Map(results.flat().map((row) => [row.eventId, row]));
};

/**
 * Every event this person joined, with the two things they can act on: whether
 * feedback is still owed, and whether a certificate is waiting.
 *
 * Identity is `userId` **or** email, for the same reason `/certificates/mine`
 * matches both: registering for an event never required an account, so someone
 * who signed up afterwards has guest rows with a null `userId` until
 * `linkAccount` runs — and it only runs when they go looking for it.
 */
export const resolveMyEvents = async ({ userId, email }) => {
  const clean = normaliseEmail(email);

  const guests = await EventGuest.findAll({
    where: {
      [Op.or]: [
        ...(userId ? [{ userId }] : []),
        // Guests predate email normalisation, so match case-insensitively
        // rather than trusting what is stored.
        ...(clean ? [{ email: { [Op.iLike]: clean } }] : []),
      ],
    },
    include: [
      { model: Event, as: "event", attributes: EVENT_ATTRIBUTES },
      {
        model: EventFeedback,
        as: "feedback",
        attributes: ["id", "submittedAt"],
        required: false,
      },
    ],
  });

  // A guest row whose event was deleted is not a card.
  const joined = guests.filter((guest) => guest.event);

  if (!joined.length) return [];

  const events = joined.map((guest) => guest.event);
  const eventIds = events.map((event) => event.id);
  const guestIds = joined.map((guest) => guest.id);

  const [certificates, teamSubmissions] = await Promise.all([
    EventCertificate.findAll({
      where: {
        eventId: { [Op.in]: eventIds },
        [Op.or]: [
          { guestId: { [Op.in]: guestIds } },
          ...(clean ? [{ recipientEmail: clean }] : []),
        ],
      },
      attributes: ["eventId", "certificateNo", "status"],
    }),
    teamSubmissionsByEvent(events, clean),
  ]);

  // Certificates are matched by email as well as guestId — a teammate is issued
  // one before they have an account, and it carries no guestId until they
  // register. Revoked rows are deliberately kept: "withdrawn" is information.
  const certificateByEvent = new Map(
    certificates.map((certificate) => [certificate.eventId, certificate]),
  );

  const cards = joined.map((guest) => {
    const event = guest.event;
    const teamSubmission = teamSubmissions.get(event.id);
    const form = getFeedbackForm(event.eventType);
    const certificate = certificateByEvent.get(event.id);

    const submitted = guest.feedback ? "self" : teamSubmission ? "team" : null;

    return {
      guestId: guest.id,
      status: guest.status,
      registeredVia: guest.additionalData?.registeredVia || null,
      joinedAt: guest.createdAt,

      event: {
        id: event.id,
        eventTitle: event.eventTitle,
        eventSubtitle: event.eventSubtitle,
        eventSlug: event.eventSlug,
        eventType: event.eventType,
        eventStartDate: event.eventStartDate,
        eventEndDate: event.eventEndDate,
        eventStartTime: event.eventStartTime,
        eventEndTime: event.eventEndTime,
        eventCreativeUrl: event.eventCreativeUrl,
        locationType: event.locationType,
      },

      feedback: {
        // "Open" means the card can offer the action — the window is open and
        // a form exists for this event type. An event type with no form can
        // never take feedback, however open the window is.
        open: Boolean(event.canAcceptResponse && form),
        submitted,
        submittedAt: guest.feedback?.submittedAt || teamSubmission?.submittedAt || null,
        submittedBy: submitted === "team" ? teamSubmission.guest?.name || null : null,
      },

      certificate: certificate
        ? {
            certificateNo: certificate.certificateNo,
            status: certificate.status,
            ready: certificate.status === EVENT_CERTIFICATE_STATUS.ISSUED,
          }
        : null,
    };
  });

  return sortForDisplay(cards);
};

/**
 * Upcoming first, soonest at the top; then past events, most recent first.
 *
 * Neither pure ordering works: newest-first buries an event happening tomorrow
 * under one from last year, and oldest-first opens on ancient history.
 */
const sortForDisplay = (cards) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const time = (card) => {
    const date = card.event.eventEndDate || card.event.eventStartDate;
    return date ? new Date(date).getTime() : 0;
  };

  const upcoming = cards
    .filter((card) => time(card) >= startOfToday.getTime())
    .sort((a, b) => time(a) - time(b));

  const past = cards
    .filter((card) => time(card) < startOfToday.getTime())
    .sort((a, b) => time(b) - time(a));

  return [...upcoming, ...past];
};
