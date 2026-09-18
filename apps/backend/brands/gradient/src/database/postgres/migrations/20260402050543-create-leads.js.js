"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("leads", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      countryCode: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      source: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING,
      },

      pageUrl: {
        type: Sequelize.STRING,
      },

      referrer: {
        type: Sequelize.STRING,
      },

      utmId: {
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

      additionalData: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex("leads", ["email"]);
    await queryInterface.addIndex("leads", ["phone"]);
    await queryInterface.addIndex("leads", ["source"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("leads");
  },
};
