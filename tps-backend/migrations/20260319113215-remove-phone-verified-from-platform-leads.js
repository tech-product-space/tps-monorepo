"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "platform_leads",
      "phoneVerified"
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("platform_leads", "phoneVerified", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  },
};