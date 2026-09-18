"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meeting_notifications", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      meeting_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "meetings", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      // Snapshot of the meeting start this notification was armed for.
      // If the meeting is rescheduled, start_time changes and reminders re-arm.
      start_time: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      // 't30' | 't5' | 'ontime'
      kind: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // Dedup ledger: each (meeting, recipient, start time, kind) fires exactly once.
    await queryInterface.addIndex(
      "meeting_notifications",
      ["meeting_id", "user_id", "start_time", "kind"],
      {
        name: "uq_meeting_notifications_dedup",
        unique: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meeting_notifications");
  },
};
