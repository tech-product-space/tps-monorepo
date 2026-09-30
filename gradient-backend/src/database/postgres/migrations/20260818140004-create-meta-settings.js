"use strict";

/**
 * Singleton row holding the runtime polling switch.
 *
 * Two switches exist and they do different jobs:
 *
 *   • `META_INTEGRATION_ENABLED` (env)  — deploy-level. Read at boot; with it
 *     off the jobs are never scheduled at all.
 *   • `meta_settings.pollEnabled` (here) — operational. Toggled from the panel,
 *     takes effect on the next run, no restart and no deploy.
 *
 * The second is what an operator reaches for when a token has expired at 11pm
 * and they want the error emails to stop until morning.
 *
 * No row is seeded. The service creates it lazily on first read so a fresh
 * database, a restored dump and a rolled-back migration all behave the same.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_settings", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      pollEnabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      lastPollAt: { type: Sequelize.DATE, allowNull: true },
      lastSyncAt: { type: Sequelize.DATE, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_settings");
  },
};
