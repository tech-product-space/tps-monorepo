import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { USER_STATUS } from "../../../config/constants/user.js";
import { compact, dateRangeClause, inClause } from "./helpers.js";

const { User } = db;

/**
 * Registered website users.
 *
 * Blocked accounts are excluded unconditionally — whatever got someone blocked,
 * marketing to them afterwards is not the intent.
 *
 * `lastLoginAt` is the interesting filter here and the reason this source
 * exists separately from leads: it is the only way to express "people who made
 * an account and never came back", which is a re-activation audience.
 */
export const resolveUsers = async (filters = {}) => {
  const where = compact({
    loginSource: inClause(filters.loginSource),
    createdAt: dateRangeClause(filters.createdFrom, filters.createdTo),
    lastLoginAt: dateRangeClause(filters.lastLoginFrom, filters.lastLoginTo),
  });

  where.status = USER_STATUS.ACTIVE;

  // Only narrow when asked. Defaulting to verified-only would silently drop
  // every Google sign-in that never went through email verification.
  if (filters.emailVerified === true || filters.emailVerified === "true") {
    where.emailVerified = true;
  }

  const rows = await User.findAll({
    where,
    attributes: ["id", "fullName", "email"],
    raw: true,
  });

  return rows.map((row) => ({
    name: row.fullName || null,
    email: row.email,
    sourceType: CAMPAIGN_SOURCE_TYPE.USERS,
    sourceId: row.id,
  }));
};
