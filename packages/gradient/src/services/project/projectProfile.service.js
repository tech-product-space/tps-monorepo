import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import { isProjectProfileStale } from "../../config/constants/project.js";

const { ProjectLead } = db;

/**
 * Somebody's last confirmed gate details, so a second project is one click.
 *
 * The lookup keys on `userId` when the request carries a website session, and
 * falls back to a lowercased email the client already holds from a previous
 * gate pass. Without a sign-in there is no stronger identity available, and
 * that is the honest limit of it: an email in local storage is a convenience,
 * not a credential. Nothing gated behind it is worth stealing — the reward for
 * forging one is a link that person could have got by typing any address at
 * all.
 *
 * Returns `null` when there is nothing to carry, or when what there is has gone
 * stale and should be re-confirmed rather than reused.
 *
 * @returns {Promise<{name, email, phone, countryCode, detailsConfirmedAt}|null>}
 */
export const findCarryableProfile = async ({ userId, email }) => {
  const or = [];

  if (userId) or.push({ userId });
  if (email) or.push({ email: String(email).trim().toLowerCase() });

  if (!or.length) return null;

  const lead = await ProjectLead.findOne({
    where: { [Op.or]: or },
    // The most recently *confirmed* details, not the most recently created row
    // — a carried row is newer than the details it copies.
    order: [["detailsConfirmedAt", "DESC"]],
  });

  if (!lead) return null;
  if (isProjectProfileStale(lead)) return null;

  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    countryCode: lead.countryCode,
    // Carried forward unchanged, never reset to now. Measuring freshness on a
    // timestamp that every carry refreshes means the window never once
    // expires.
    detailsConfirmedAt: lead.detailsConfirmedAt,
  };
};
