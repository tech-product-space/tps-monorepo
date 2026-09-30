"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("EventGuests", "certificateApproved", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(`
      UPDATE "EventGuests"
      SET "certificateApproved" = true
      WHERE "certificateGenerated" = true;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("EventGuests", "certificateApproved");
  },
};
