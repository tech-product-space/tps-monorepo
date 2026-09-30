"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("subscribers", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      status: {
        type: Sequelize.STRING,
      },

      source: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      pageUrl: {
        type: Sequelize.STRING,
      },

      referrer: {
        type: Sequelize.STRING,
      },

      utmSource: {
        type: Sequelize.STRING,
      },

      utmMedium: {
        type: Sequelize.STRING,
      },

      utmCampaign: {
        type: Sequelize.STRING,
      },

      utmTerm: {
        type: Sequelize.STRING,
      },

      utmContent: {
        type: Sequelize.STRING,
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

    await queryInterface.addIndex("subscribers", ["email"], { unique: true });
    await queryInterface.addIndex("subscribers", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("subscribers");
  },
};
