import { Op } from "sequelize";

import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { compact, inClause, toRecipient } from "./helpers.js";

const { EventGuest, EventFeedback } = db;

/**
 * Guests of an event, split by whether they answered its feedback form.
 *
 * Two audiences from one switch, and they want opposite emails:
 *
 *   - **Responded** — people who told us what they thought. Ask for a
 *     testimonial, or invite them to the next one.
 *   - **Did not respond** — the nudge. At Gradient this one has teeth, because
 *     feedback is what triggers a certificate: "you attended, you have not
 *     filled the form, your certificate is waiting" is a real message with a
 *     real reason to send it.
 *
 * Resolved from `EventGuests` rather than `EventFeedbacks` in both directions.
 * The non-responder half has to be — there is no row to select — and doing the
 * responder half the same way keeps one code path and one shape of `sourceId`.
 *
 * `status` is worth setting for the nudge: a waitlisted guest who never got in
 * has nothing to give feedback about, and telling them off for not filing it
 * would be a bad email to receive.
 */
export const resolveEventFeedback = async (filters = {}) => {
  const eventId = inClause(filters.eventId);

  // Without an event this is "everyone who has ever attended anything, split by
  // a form they may not have been offered". Not a plausible intent either way.
  if (!eventId) return [];

  // Default to responders: it is the affirmative reading of the source name,
  // and the destructive mistake here is mailing a nudge to people who already
  // did the thing.
  const responded = filters.responded === undefined ? true : Boolean(filters.responded);

  const where = compact({
    eventId,
    status: inClause(filters.status),
    attendeeType: inClause(filters.attendeeType),
  });

  where.email = { [Op.ne]: null };

  // The null check goes in the OUTER where, as `$feedback.id$`, not inside the
  // include. A `where` on a `required: false` include is compiled into the JOIN
  // ... ON condition, so `ON feedback."guestId" = guest.id AND feedback.id IS
  // NULL` would match every guest and quietly mail the whole event.
  if (!responded) where["$feedback.id$"] = { [Op.is]: null };

  const rows = await EventGuest.findAll({
    where,
    attributes: ["id", "name", "email"],
    include: [
      {
        model: EventFeedback,
        as: "feedback",
        attributes: [],
        // Inner join for responders, left join for the rest.
        required: responded,
      },
    ],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.EVENT_FEEDBACK));
};
