"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("cal_bookings", "leads91Synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("cal_bookings", "leads91SyncedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("cal_bookings", "leads91Synced");
    await queryInterface.removeColumn("cal_bookings", "leads91SyncedAt");
  },
};