"use strict";

/**
 * Per-form backfill status + progress. A backfill paginates a form's entire
 * lead history (bypassing the 10-min poll window) as a detached background job;
 * these columns let the job report live progress that the UI polls.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = {
      // 'idle' | 'running' | 'done' | 'error'
      backfill_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "idle",
      },
      backfill_total: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfill_inserted: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfill_duplicates: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfill_since: { type: Sequelize.DATE, allowNull: true },
      backfill_error: { type: Sequelize.TEXT, allowNull: true },
      backfill_started_at: { type: Sequelize.DATE, allowNull: true },
      backfill_finished_at: { type: Sequelize.DATE, allowNull: true },
    };
    for (const [name, spec] of Object.entries(cols)) {
      await queryInterface.addColumn("meta_forms", name, spec);
    }
  },

  async down(queryInterface) {
    const names = [
      "backfill_status",
      "backfill_total",
      "backfill_inserted",
      "backfill_duplicates",
      "backfill_since",
      "backfill_error",
      "backfill_started_at",
      "backfill_finished_at",
    ];
    for (const name of names) {
      await queryInterface.removeColumn("meta_forms", name);
    }
  },
};
