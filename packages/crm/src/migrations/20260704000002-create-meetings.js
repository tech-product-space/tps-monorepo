"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meetings", {
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
      profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "lead_profiles", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      organizer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      google_event_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      calendar_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: "primary",
      },
      meet_link: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Stored UTC; timezone below is what Google displays to attendees.
      start_time: { type: Sequelize.DATE, allowNull: false },
      end_time: { type: Sequelize.DATE, allowNull: false },
      timezone: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: "Asia/Kolkata",
      },
      // 'scheduled' | 'cancelled'
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "scheduled",
      },
      // True when scheduling also moved the lead to the meeting status
      // and set next_followup (drives reschedule/cancel follow-up sync).
      status_synced: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // [{ email, user_id|null, name, type: 'lead'|'internal' }]
      attendees: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("meetings", ["organizer_id", "start_time"], {
      name: "idx_meetings_organizer_start",
    });
    await queryInterface.addIndex("meetings", ["lead_id"], {
      name: "idx_meetings_lead",
    });
    await queryInterface.addIndex("meetings", ["status", "start_time"], {
      name: "idx_meetings_status_start",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meetings");
  },
};
