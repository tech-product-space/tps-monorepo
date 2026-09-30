"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_node_runs", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      enrollment_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      node_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      attempt: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      finished_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      output: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      provider_message_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      error: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex(
      "workflow_node_runs",
      ["enrollment_id", "node_id", "attempt"],
      { unique: true, name: "uniq_workflow_node_run" }
    );

    await queryInterface.addIndex("workflow_node_runs", [
      "provider_message_id",
    ]);

    await queryInterface.addIndex("workflow_node_runs", ["enrollment_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_node_runs");
  },
};
