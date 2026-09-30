"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("EventReminders", "scheduledAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("EventReminders", "scheduledAt", {
      type: Sequelize.DATE,
      allowNull: false,
    });
  },
};