import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import {
  SUBSCRIBER_SOURCE,
  SUBSCRIBER_STATUS,
} from "../../config/constants/subscriber.js";
import logger from "../../util/logger.js";
import { emitUnsubscribed } from "../leadEvent/emitters.js";

const { Subscriber } = db;

/**
 * Consent state for email addresses.
 *
 * The `subscribers` table is the single suppression list — there is no separate
 * `unsubscribes` table — so this module is the only place that writes
 * `status: unsubscribed` and the metadata beside it. Read
 * MARKETING_CAMPAIGN_PLAN.md §3.4 before adding a second writer.
 *
 * **Scope:** suppression blocks *marketing campaigns only*. Event reminders,
 * certificates, password resets and admin invites are transactional and keep
 * sending — an unsubscribe is not a request to stop hearing about an event you
 * registered for. Only the campaign send job consults this.
 */

/** One normalisation, used by every read and write here. */
const normalise = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

/**
 * May we send marketing to this address?
 *
 * Called once per recipient immediately before the send, on top of the bulk
 * filter at audience-build time. The second check is what stops a long send
 * from continuing to mail someone who unsubscribed part-way through it —
 * from the very campaign that prompted them.
 */
export const isSuppressed = async (email) => {
  const normalised = normalise(email);

  if (!normalised) return true; // nothing to send to

  const row = await Subscriber.findOne({
    where: {
      email: normalised,
      status: SUBSCRIBER_STATUS.UNSUBSCRIBED,
    },
    attributes: ["id"],
  });

  return Boolean(row);
};

/**
 * The suppressed subset of a list of addresses, as a Set of lowercased emails.
 *
 * One query for the whole audience — the per-recipient check above would be
 * tens of thousands of round trips at build time.
 */
export const findSuppressed = async (emails = []) => {
  const normalised = [
    ...new Set(emails.map(normalise).filter(Boolean)),
  ];

  if (!normalised.length) return new Set();

  const rows = await Subscriber.findAll({
    where: {
      email: { [Op.in]: normalised },
      status: SUBSCRIBER_STATUS.UNSUBSCRIBED,
    },
    attributes: ["email"],
  });

  return new Set(rows.map((row) => row.email));
};

/**
 * Ends live workflow enrolments for an address that has just opted out.
 *
 * Fire-and-forget and lazily imported: the workflow enrolment service pulls in
 * the queue, and an unsubscribe must not fail — or wait — because Redis is
 * having a moment. The opt-out itself is already recorded by the time this
 * runs.
 */
const endWorkflowJourneys = (email) => {
  import("../workflow/enrollment.service.js")
    .then(({ cancelEnrollmentsForEmail }) => cancelEnrollmentsForEmail(email))
    .catch((error) =>
      logger.error("Could not end workflow journeys on unsubscribe", {
        email,
        error: error.message,
      }),
    );
};

/**
 * Records that an address must no longer receive marketing.
 *
 * Upsert, because the person may or may not already be a subscriber:
 *
 * - existing row → flipped to `unsubscribed`, metadata attached, `source` left
 *   alone (it records where the row came from, not where they left from)
 * - no row       → created as `unsubscribed`, `source: campaignUnsubscribe`
 *
 * A created row is a consent record, not a claim that they ever signed up. It
 * does not affect the Active count the Subscribers page reports on.
 *
 * Idempotent: unsubscribing twice refreshes the metadata and changes nothing
 * else, so a double-clicked link is not an error.
 */
export const suppress = async ({
  email,
  name = null,
  reason = null,
  campaignId = null,
  source = SUBSCRIBER_SOURCE.CAMPAIGN_UNSUBSCRIBE,
}) => {
  const normalised = normalise(email);

  if (!normalised) return null;

  const existing = await Subscriber.findOne({
    where: { email: normalised },
  });

  const metadata = {
    status: SUBSCRIBER_STATUS.UNSUBSCRIBED,
    unsubscribedAt: new Date(),
    unsubscribeReason: reason || null,
    unsubscribedFromCampaignId: campaignId || null,
  };

  if (existing) {
    await existing.update({
      ...metadata,
      // Only fill a blank name; an address we already knew by name should not
      // be renamed by whatever a campaign recipient row happened to carry.
      name: existing.name || name || null,
    });

    logger.info("Subscriber suppressed", {
      email: normalised,
      campaignId,
      existing: true,
    });

    // Onto the activity stream. Emitted from here because this service is the
    // single writer of consent state, so the two cannot drift by anyone
    // forgetting to call both. Fire-and-forget; an opt-out must never fail
    // because a timeline row could not be written.
    emitUnsubscribed(existing, { campaignId, source });

    // Ends every live workflow journey for this address rather than
    // suppressing each remaining send in turn. A campaign is one send, so
    // opting out stops it because nothing is left; a workflow has four more
    // emails queued, and skipping them one at a time is invisible work that
    // reaches the same place slower. See WORKFLOW_AUTOMATION_PLAN.md 8.2.
    endWorkflowJourneys(normalised);

    return existing;
  }

  const created = await Subscriber.create({
    email: normalised,
    name: name || null,
    source,
    ...metadata,
  });

  logger.info("Subscriber suppressed", {
    email: normalised,
    campaignId,
    existing: false,
  });

  emitUnsubscribed(created, { campaignId, source });

  endWorkflowJourneys(normalised);

  return created;
};
