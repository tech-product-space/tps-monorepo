import { Op } from "sequelize";

import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import {
  compact,
  dateRangeClause,
  inClause,
  toRecipient,
} from "./helpers.js";

const { Lead } = db;

/**
 * Website leads — enquiries, brochure downloads, callback requests, job
 * applications. The broadest source we have.
 *
 * `source` / `subSource` are not an enum: they are whatever the public site
 * posted, which is why the panel offers them from `GET /leads/sources` rather
 * than a hardcoded list. Nothing here validates them against a set — an unknown
 * source simply matches nothing, which is the honest outcome.
 *
 * `Lead.email` is nullable, so this is one of the sources where the email
 * validity guard in buildRecipients is load-bearing.
 */
export const resolveLeads = async (filters = {}) => {
  const where = compact({
    source: inClause(filters.source),
    subSource: inClause(filters.subSource),
    status: inClause(filters.status),
    courseId: inClause(filters.courseId),
    utmSource: inClause(filters.utmSource),
    utmMedium: inClause(filters.utmMedium),
    utmCampaign: inClause(filters.utmCampaign),
    createdAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  // Rows with no address cannot be mailed and would only be discarded later.
  where.email = { [Op.ne]: null };

  const rows = await Lead.findAll({
    where,
    attributes: ["id", "name", "email"],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.LEADS));
};
