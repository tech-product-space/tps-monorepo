'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('NewsletterCampaigns', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      subject: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      senderEmail: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      senderName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      audienceType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      audienceFrom: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      audienceTo: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      totalRecipients: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      sentCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      failedCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      status: {
        type: Sequelize.STRING,
        defaultValue: 'sent',
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('NewsletterCampaigns');
  },
};
