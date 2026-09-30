'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Events', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      eventTitle: Sequelize.STRING,
      eventSubtitle: Sequelize.STRING,

      eventStartDate: Sequelize.STRING,
      eventEndDate: Sequelize.STRING,
      eventStartTime: Sequelize.STRING,
      eventEndTime: Sequelize.STRING,

      speakers: Sequelize.JSONB,
      numberOfAttendees: Sequelize.INTEGER,

      eventCreativeUrl: Sequelize.STRING,

      isPublished: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      eventType: Sequelize.STRING,

      eventCategory: Sequelize.STRING,

      ctaType: Sequelize.STRING,

      location: Sequelize.TEXT,
      locationType: Sequelize.TEXT,

      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
      },

      eventDetails: Sequelize.JSONB,

      seo: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      eventSlug: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },

      canAcceptResponse: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      scheduledAt: {
        type: Sequelize.DATE,
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Events');
  },
};