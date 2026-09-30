"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_pages", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      integration_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "meta_integrations",
          key: "id",
        },
        onDelete: "CASCADE",
      },

      page_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      page_name: {
        type: Sequelize.STRING,
      },

      page_access_token: {
        type: Sequelize.TEXT,
      },

      metadata: {
        type: Sequelize.JSONB,
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_pages");
  },
};