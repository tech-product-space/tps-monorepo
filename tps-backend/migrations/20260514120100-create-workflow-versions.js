"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_versions", {
      workflow_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      definition: {
        type: Sequelize.JSONB,
        allowNull: false,
      },

      published_by: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      published_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
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

    await queryInterface.addConstraint("workflow_versions", {
      fields: ["workflow_id", "version"],
      type: "primary key",
      name: "workflow_versions_pkey",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_versions");
  },
};
