"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("followup_notifications", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      lead_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "leads", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      // Snapshot of the follow-up time this notification was armed for.
      // If the lead is rescheduled, followup_at changes and reminders re-arm.
      followup_at: {
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

    // Dedup ledger: each (lead, followup time, kind) fires exactly once.
    await queryInterface.addIndex(
      "followup_notifications",
      ["lead_id", "followup_at", "kind"],
      {
        name: "uq_followup_notifications_dedup",
        unique: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("followup_notifications");
  },
};
