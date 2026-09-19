"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("campaign_recipients", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      campaign_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "campaigns",
          key: "id",
        },
        onDelete: "CASCADE",
      },

      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      source_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      source_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      error: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex("campaign_recipients", ["campaign_id"]);
    await queryInterface.addIndex("campaign_recipients", ["email"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("campaign_recipients");
  },
};
