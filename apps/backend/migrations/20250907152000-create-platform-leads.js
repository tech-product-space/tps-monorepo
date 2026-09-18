"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("platform_leads", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      phone: {
        type: Sequelize.BIGINT, // safer for long numbers
        allowNull: true,
      },
      type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      additionalData: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("platform_leads");
  },
};
