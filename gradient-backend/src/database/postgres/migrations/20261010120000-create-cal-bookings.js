"use strict";

export default {
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
        allowNull: true,
      },
      eventType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      startTime: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      endTime: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      attendeeName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      attendeeEmail: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      attendeePhone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      attendeeTimeZone: {
        type: Sequelize.STRING,
        allowNull: true,
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
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "booked",
      },
      rawPayload: {
        type: Sequelize.JSONB,
        allowNull: true,
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

    await queryInterface.addIndex("cal_bookings", ["iCalUID"]);
    await queryInterface.addIndex("cal_bookings", ["startTime"]);
    await queryInterface.addIndex("cal_bookings", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cal_bookings");
  },
};
