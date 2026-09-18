"use strict";

/**
 * Singleton runtime settings for the Meta cron. `poll_enabled` is the global
 * on/off switch toggled from the UI (no process restart needed — the poll job
 * reads it each run). META_CRON_ENABLED env stays the master switch that
 * decides whether the schedules are registered at boot.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_settings", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      poll_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_poll_at: { type: Sequelize.DATE, allowNull: true },
      last_sync_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.bulkInsert("meta_settings", [
      {
        poll_enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_settings");
  },
};
