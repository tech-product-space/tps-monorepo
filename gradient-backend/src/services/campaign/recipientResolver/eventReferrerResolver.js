import { Op } from "sequelize";

import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { USER_STATUS } from "../../../config/constants/user.js";

const { sequelize, User } = db;

/**
 * People who referred somebody to an event.
 *
 * They have already sold Gradient to another human being, unprompted, which is
 * a stronger signal than anything else recorded here — and this is the only
 * source that can be **ranked**, because referral count is a number.
 *
 * Two queries on purpose. The count is a `GROUP BY … HAVING COUNT(*) >= n`,
 * which is awkward through `findAll` — but the addresses are fetched through
 * the `User` model rather than joined in SQL, because **`users` is the one
 * table in this schema with `underscored: true`**. Its columns are `full_name`,
 * not `"fullName"`, and hand-written SQL that joins it is one rename away from
 * a runtime error the model layer would have absorbed.
 *
 * Counted **distinct by referred guest**, so somebody invited to three events
 * by the same referrer counts three times — which is what "how many people did
 * you bring" means to the person being thanked.
 */
export const resolveEventReferrers = async (filters = {}) => {
  const eventIds = Array.isArray(filters.eventId)
    ? filters.eventId.filter(Boolean)
    : filters.eventId
      ? [filters.eventId]
      : [];

  const minReferrals = Number.isFinite(Number(filters.minReferrals))
    ? Math.max(1, Math.floor(Number(filters.minReferrals)))
    : 1;

  const counts = await sequelize.query(
    `
    SELECT g."referrerUserId" AS "userId", COUNT(DISTINCT g.id) AS "referrals"
    FROM "EventGuests" g
    WHERE g."referrerUserId" IS NOT NULL
      ${eventIds.length ? 'AND g."eventId" IN (:eventIds)' : ""}
    GROUP BY g."referrerUserId"
    HAVING COUNT(DISTINCT g.id) >= :minReferrals;
    `,
    {
      replacements: {
        minReferrals,
        // Never interpolated when empty — the clause is omitted instead, since
        // an empty `IN ()` is a syntax error rather than "matches nothing".
        ...(eventIds.length ? { eventIds } : {}),
      },
      type: sequelize.QueryTypes.SELECT,
    },
  );

  if (!counts.length) return [];

  const users = await User.findAll({
    where: {
      id: { [Op.in]: counts.map((c) => c.userId) },
      status: USER_STATUS.ACTIVE,
      email: { [Op.ne]: null },
    },
    attributes: ["id", "fullName", "email"],
    raw: true,
  });

  return users.map((user) => ({
    name: user.fullName || null,
    email: user.email,
    sourceType: CAMPAIGN_SOURCE_TYPE.EVENT_REFERRERS,
    sourceId: user.id,
  }));
};
