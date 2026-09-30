"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "referral_code", {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "referral_code");
  },
};
