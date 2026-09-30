"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_enrollments", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      workflow_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      workflow_version: {
        type: Sequelize.INTEGER,
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

      lead_email_snapshot: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      lead_phone_snapshot: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      lead_name_snapshot: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "active",
      },

      current_node_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      context: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      next_scheduled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      enrolled_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      error_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      enrollment_source: {
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

    await queryInterface.addIndex("workflow_enrollments", [
      "status",
      "next_scheduled_at",
    ]);

    await queryInterface.addIndex("workflow_enrollments", [
      "workflow_id",
      "status",
    ]);

    await queryInterface.addIndex("workflow_enrollments", [
      "lead_source_type",
      "lead_source_id",
      "status",
    ]);

    await queryInterface.addIndex(
      "workflow_enrollments",
      ["workflow_id", "lead_source_type", "lead_source_id"],
      {
        unique: true,
        where: { status: "active" },
        name: "uniq_active_workflow_enrollment",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_enrollments");
  },
};
