"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflows", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "draft",
      },

      current_version: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      trigger_config: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      draft_definition: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      created_by: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      published_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex("workflows", ["status"]);
    await queryInterface.addIndex("workflows", ["created_by"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflows");
  },
};
