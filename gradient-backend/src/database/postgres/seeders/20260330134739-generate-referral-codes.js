"use strict";

import generateReferralCode from "../../../util/helpers/generateReferralCode.js";


export default {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE "referral_code" IS NULL`,
      { type: Sequelize.QueryTypes.SELECT },
    );

    for (const user of users) {
      let code;
      let exists = true;

      while (exists) {
        code = generateReferralCode();

        const existing = await queryInterface.sequelize.query(
          `SELECT id FROM users WHERE "referral_code" = :code`,
          {
            replacements: { code },
            type: Sequelize.QueryTypes.SELECT,
          },
        );

        exists = existing.length > 0;
      }

      await queryInterface.sequelize.query(
        `UPDATE users SET "referral_code" = :code WHERE id = :id`,
        {
          replacements: {
            code,
            id: user.id,
          },
        },
      );
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE users SET "referral_code" = NULL`,
    );
  },
};
