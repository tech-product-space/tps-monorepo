"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Visitors", "userAgent", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Visitors", "userAgent", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};