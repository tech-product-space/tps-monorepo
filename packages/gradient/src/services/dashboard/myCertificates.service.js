import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { Event, EventCertificate, EventGuest } = db;

import { EVENT_CERTIFICATE_STATUS } from "../../config/constants/eventCertificate.js";

/**
 * Certificates issued to this person, newest first.
 *
 * Matched on `guestId` **or** email, and the email half is the important one: a
 * teammate is issued a certificate before they have an account, and that row
 * carries no `guestId` until they register. Matching only on the guest would
 * hide exactly the certificates people are most likely to come looking for.
 *
 * **No presigned URLs.** This is a list; the verify page mints one when someone
 * actually opens a certificate. A URL in a listing outlives a revocation.
 */
export const resolveMyCertificates = async ({ userId, email }) => {
  const clean = String(email || "").trim().toLowerCase();

  const guestIds = userId
    ? (
        await EventGuest.findAll({ where: { userId }, attributes: ["id"] })
      ).map((guest) => guest.id)
    : [];

  if (!guestIds.length && !clean) return [];

  return EventCertificate.findAll({
    where: {
      status: EVENT_CERTIFICATE_STATUS.ISSUED,
      [Op.or]: [
        ...(clean ? [{ recipientEmail: clean }] : []),
        ...(guestIds.length ? [{ guestId: { [Op.in]: guestIds } }] : []),
      ],
    },
    attributes: ["certificateNo", "recipientName", "issuedAt"],
    include: [
      {
        model: Event,
        as: "event",
        attributes: ["eventTitle", "eventSlug", "eventType", "eventStartDate"],
      },
    ],
    order: [["issuedAt", "DESC"]],
  });
};
