"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("platform_leads", "phone", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("platform_leads", "phone", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },
};