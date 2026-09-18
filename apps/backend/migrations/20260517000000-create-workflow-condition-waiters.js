"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_condition_waiters", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      // Each enrollment can park on at most one condition node at a time.
      // The unique constraint also gives us the atomic "the row exists or it
      // doesn't" check that settles the timeout-vs-event race.
      enrollment_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      node_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      event_type: {
        type: Sequelize.STRING,
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

      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
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

    // Hot path: on every LeadEvent insert, look up waiters by
    // (lead, event_type) so we can wake them.
    await queryInterface.addIndex("workflow_condition_waiters", {
      name: "wf_condition_waiters_lead_event_idx",
      fields: ["lead_source_type", "lead_source_id", "event_type"],
    });

    // Reconciler path: find waiters whose timeout already passed.
    await queryInterface.addIndex("workflow_condition_waiters", {
      name: "wf_condition_waiters_expires_idx",
      fields: ["expires_at"],
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_condition_waiters");
  },
};
