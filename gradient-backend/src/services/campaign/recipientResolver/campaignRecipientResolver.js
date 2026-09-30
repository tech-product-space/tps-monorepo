import db from "../../../database/postgres/models/index.js";
import {
  CAMPAIGN_RECIPIENT_STATUS,
  CAMPAIGN_SOURCE_TYPE,
} from "../../../config/constants/campaign.js";
import { compact, inClause, toRecipient } from "./helpers.js";

const { CampaignRecipient } = db;

/**
 * People a previous campaign already reached.
 *
 * Built primarily for the **exclude** side: putting
 * `{ type: "campaignRecipients", filters: { campaignId: ["01J…"] } }` in
 * `exclude` is how you stop mailing the same three thousand people every
 * fortnight. That is the cheapest deliverability win available and the reason
 * this resolver exists in phase 2 rather than later.
 *
 * It works on the include side too — re-targeting everyone who failed on a
 * previous send, say — which is why `status` is a filter rather than fixed.
 *
 * Defaults to `sent` because "who received campaign X" is the question being
 * asked nine times in ten; suppressed and failed rows are people the campaign
 * did *not* reach, and excluding them would wrongly shrink the next audience.
 */
export const resolveCampaignRecipients = async (filters = {}) => {
  const campaignId = inClause(filters.campaignId);

  // Without a campaign this would resolve to every person ever mailed. On the
  // exclude side that silently empties the audience; on the include side it
  // mails everyone. Neither is a plausible intent.
  if (!campaignId) return [];

  const where = compact({
    campaignId,
    status: inClause(filters.status ?? CAMPAIGN_RECIPIENT_STATUS.SENT),
  });

  const rows = await CampaignRecipient.findAll({
    where,
    attributes: ["id", "name", "email"],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.CAMPAIGN_RECIPIENTS));
};
