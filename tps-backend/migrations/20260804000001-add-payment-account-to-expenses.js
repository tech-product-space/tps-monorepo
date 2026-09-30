"use strict";

// Free-text account the money moved through ("HDFC Current A/C", "Petty Cash").
// Deliberately NOT a lookup table: the admin combobox offers the distinct values
// already in use, so anything typed once becomes selectable afterwards.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("expenses", "payment_account", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("recurring_expenses", "payment_account", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("recurring_expenses", "payment_account");
    await queryInterface.removeColumn("expenses", "payment_account");
  },
};
