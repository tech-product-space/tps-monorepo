"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_integrations", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      account_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      account_name: {
        type: Sequelize.STRING,
      },

      access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
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
    await queryInterface.dropTable("meta_integrations");
  },
};
