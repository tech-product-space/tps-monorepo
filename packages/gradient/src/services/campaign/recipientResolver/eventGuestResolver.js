import { Op } from "sequelize";

import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { compact, inClause, toRecipient } from "./helpers.js";

const { EventGuest } = db;

/**
 * People who registered for an event.
 *
 * Targeting is **per event**, not global: "approved attendees of the March
 * workshop plus everyone waitlisted for April" is a normal thing to want, and a
 * single status filter across all events cannot express it. So `eventFilters`
 * is a map of eventId → `{ status, attendeeType }`:
 *
 *   { eventFilters: { "01J…": { status: "Approved", attendeeType: "Professional" } } }
 *
 * An omitted status or attendeeType means "all" for that event. The plain
 * `eventId[]` form is also accepted for the simple case.
 *
 * `EventGuest.email` is nullable — phone is the required field — so the email
 * guard matters here.
 */
export const resolveEventGuests = async (filters = {}) => {
  const eventFilters = filters.eventFilters || {};
  const perEventIds = Object.keys(eventFilters);

  const clauses = [];

  for (const eventId of perEventIds) {
    const { status, attendeeType } = eventFilters[eventId] || {};

    clauses.push(
      compact({
        eventId,
        status: inClause(status),
        attendeeType: inClause(attendeeType),
      }),
    );
  }

  // Simple form: whole events, no per-event narrowing.
  const plainIds = (Array.isArray(filters.eventId)
    ? filters.eventId
    : filters.eventId
      ? [filters.eventId]
      : []
  ).filter((id) => !perEventIds.includes(id));

  if (plainIds.length) {
    clauses.push(
      compact({
        eventId: inClause(plainIds),
        status: inClause(filters.status),
        attendeeType: inClause(filters.attendeeType),
      }),
    );
  }

  // No events chosen resolves to nobody. Defaulting to "every guest of every
  // event we have ever run" would be a spectacular way to misread a UI where
  // someone ticked the source and then picked nothing.
  if (!clauses.length) return [];

  const rows = await EventGuest.findAll({
    where: {
      [Op.or]: clauses,
      email: { [Op.ne]: null },
    },
    attributes: ["id", "name", "email"],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS));
};
