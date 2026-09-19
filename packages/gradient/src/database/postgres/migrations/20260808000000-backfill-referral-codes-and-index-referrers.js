"use strict";

/**
 * Event referral support.
 *
 * 1. Backfills `users.referral_code` for rows created before the
 *    `User.beforeCreate` hook existed — every user needs a code before the
 *    referral page can hand them a shareable link.
 * 2. Indexes the columns the referral aggregations read: referral counting
 *    and the admin leaderboard both filter EventGuests by
 *    (eventId, referrerUserId).
 */

const CODE_LENGTH = 8;

function generateReferralCode() {
  return Math.random().toString(36).slice(2, 2 + CODE_LENGTH).toUpperCase();
}

export default {
  async up(queryInterface, Sequelize) {
    const [users] = await queryInterface.sequelize.query(
      `SELECT id FROM "users" WHERE "referral_code" IS NULL`,
    );

    if (users.length) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT "referral_code" FROM "users" WHERE "referral_code" IS NOT NULL`,
      );

      const taken = new Set(existing.map((row) => row.referral_code));

      for (const user of users) {
        let code = generateReferralCode();
        let attempts = 0;

        while ((taken.has(code) || code.length < CODE_LENGTH) && attempts < 20) {
          code = generateReferralCode();
          attempts++;
        }

        if (taken.has(code) || code.length < CODE_LENGTH) {
          throw new Error(
            `Unable to generate a unique referral code for user ${user.id}`,
          );
        }

        taken.add(code);

        await queryInterface.sequelize.query(
          `UPDATE "users" SET "referral_code" = :code WHERE "id" = :id`,
          { replacements: { code, id: user.id } },
        );
      }
    }

    await queryInterface.addIndex("EventGuests", ["referrerUserId"], {
      name: "event_guests_referrer_user_id_idx",
    });

    await queryInterface.addIndex("EventGuests", ["eventId", "referrerUserId"], {
      name: "event_guests_event_id_referrer_user_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "EventGuests",
      "event_guests_event_id_referrer_user_id_idx",
    );

    await queryInterface.removeIndex(
      "EventGuests",
      "event_guests_referrer_user_id_idx",
    );

    // Backfilled codes are intentionally left in place — dropping them would
    // invalidate links that have already been shared.
  },
};
