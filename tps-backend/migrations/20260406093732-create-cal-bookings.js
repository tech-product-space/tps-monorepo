"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cal_bookings", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      bookingUid: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      iCalUID: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      eventTitle: {
        type: Sequelize.STRING,
      },

      eventType: {
        type: Sequelize.STRING,
      },

      startTime: {
        type: Sequelize.DATE,
      },

      endTime: {
        type: Sequelize.DATE,
      },

      attendeeName: {
        type: Sequelize.STRING,
      },

      attendeeEmail: {
        type: Sequelize.STRING,
      },

      attendeePhone: {
        type: Sequelize.STRING,
      },

      attendeeTimeZone: {
        type: Sequelize.STRING,
      },

      attendeeNotes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      rescheduleReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      cancellationReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      meetingUrl: {
        type: Sequelize.TEXT,
      },

      status: {
        type: Sequelize.STRING,
      },

      rawPayload: {
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("cal_bookings");
  },
};
