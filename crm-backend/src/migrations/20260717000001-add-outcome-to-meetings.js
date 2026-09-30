"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Until now "completed" was derived purely from the clock (end_time < now),
    // so a finished meeting and an ignored one looked identical. `outcome` is
    // the human verdict that separates them: null = nobody has said what
    // happened yet, which is what the Needs-outcome queue selects on.
    // 'attended' | 'no_show' | 'cancelled_late'
    await queryInterface.addColumn("meetings", "outcome", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addColumn("meetings", "outcome_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("meetings", "outcome_by", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    // The LeadNote written when the outcome was logged, so the Done card can
    // show the note without a second lookup by lead.
    await queryInterface.addColumn("meetings", "outcome_note_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "lead_notes", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    // Set when logging an outcome also booked the follow-up call, chaining a
    // meeting to its successor.
    await queryInterface.addColumn("meetings", "next_meeting_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "meetings", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    // Drives the Needs-outcome bucket: scheduled, ended, no verdict yet.
    await queryInterface.addIndex("meetings", ["status", "end_time", "outcome"], {
      name: "idx_meetings_status_end_outcome",
    });

    // This migration once carried a backfill that settled every already-ended
    // meeting as 'attended', to stop the queue opening full of history. It was
    // split out and then dropped entirely: an outcome is a human's verdict, and
    // writing one nobody gave is worse than an untidy queue. Pre-feature
    // meetings therefore arrive with outcome NULL and wait, like any other.
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("meetings", "idx_meetings_status_end_outcome");
    await queryInterface.removeColumn("meetings", "next_meeting_id");
    await queryInterface.removeColumn("meetings", "outcome_note_id");
    await queryInterface.removeColumn("meetings", "outcome_by");
    await queryInterface.removeColumn("meetings", "outcome_at");
    await queryInterface.removeColumn("meetings", "outcome");
  },
};
