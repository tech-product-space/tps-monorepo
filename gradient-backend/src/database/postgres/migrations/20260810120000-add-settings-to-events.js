"use strict";

export default {
  async up(queryInterface, Sequelize) {
    // Per-event switches for the feedback + certificate flow. A JSONB block
    // rather than a column per toggle so the next one is a constant edit
    // instead of a migration — same shape as Course.pricing / Course.settings.
    //
    // Defaults live in config/constants/event.js and are layered on at read
    // time by resolveEventSettings(), so '{}' here behaves as all-on and rows
    // written before a key existed keep working.
    await queryInterface.addColumn("Events", "settings", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Events", "settings");
  },
};
