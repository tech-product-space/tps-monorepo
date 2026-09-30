"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Change "type" column to allow NULL
    await queryInterface.changeColumn("referrals", "type", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Rollback: make "type" column NOT NULL again
    await queryInterface.changeColumn("referrals", "type", {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};
