"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("lead_events", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      lead_source_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      lead_source_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      event_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      occurred_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      enrollment_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      workflow_node_run_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      provider_message_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      dedupe_key: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("lead_events", ["dedupe_key"], {
      unique: true,
      name: "uniq_lead_events_dedupe_key",
      where: { dedupe_key: { [Sequelize.Op.ne]: null } },
    });

    await queryInterface.addIndex(
      "lead_events",
      ["lead_source_type", "lead_source_id", "event_type", "occurred_at"],
      { name: "idx_lead_events_lead_event_time" }
    );

    await queryInterface.addIndex("lead_events", ["provider_message_id"], {
      name: "idx_lead_events_provider_msg",
    });

    await queryInterface.addIndex("lead_events", ["enrollment_id"], {
      name: "idx_lead_events_enrollment",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("lead_events");
  },
};
