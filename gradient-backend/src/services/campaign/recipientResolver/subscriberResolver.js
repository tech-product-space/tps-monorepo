import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { SUBSCRIBER_STATUS } from "../../../config/constants/subscriber.js";
import {
  compact,
  dateRangeClause,
  inClause,
  toRecipient,
} from "./helpers.js";

const { Subscriber } = db;

/**
 * Newsletter subscribers.
 *
 * `status` defaults to active and **is not overridable to `unsubscribed`**.
 * This table is also the suppression list, so a filter that could select
 * unsubscribed rows would let a campaign target precisely the people who asked
 * not to be targeted — buildRecipients would drop them again a moment later,
 * but the audience should never have contained them in the first place.
 */
export const resolveSubscribers = async (filters = {}) => {
  const where = compact({
    source: inClause(filters.source),
    utmSource: inClause(filters.utmSource),
    utmMedium: inClause(filters.utmMedium),
    utmCampaign: inClause(filters.utmCampaign),
    createdAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  where.status = SUBSCRIBER_STATUS.ACTIVE;

  const rows = await Subscriber.findAll({
    where,
    attributes: ["id", "name", "email"],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.SUBSCRIBERS));
};
