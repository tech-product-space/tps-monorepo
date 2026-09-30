"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("unsubscribes", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false,
      },

      campaignId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("unsubscribes");
  },
};