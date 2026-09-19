"use strict";

export default {
  async up(queryInterface, Sequelize) {
    // The job now decides between SENT and FAILED from these counts, so they
    // must never be null — a reminder with no counts is one that has not run.
    await queryInterface.addColumn("EventReminders", "totalSent", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn("EventReminders", "totalFailed", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // Rows left on `processing` by the old code can never run again: the job's
    // own guard skips them. Nothing is actually sending, so hand them back.
    await queryInterface.sequelize.query(`
      UPDATE "EventReminders"
      SET "status" = 'failed'
      WHERE "status" = 'processing'
    `);

    // Deliberately NOT backfilling 'scheduled' onto rows that carry a
    // scheduledAt: the old cancel bug deleted their agenda_jobs rows, so most
    // of them have no queued job behind them. Leaving them 'pending' keeps the
    // panel honest — they have to be cancelled and re-scheduled once.
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("EventReminders", "totalFailed");
    await queryInterface.removeColumn("EventReminders", "totalSent");
  },
};
