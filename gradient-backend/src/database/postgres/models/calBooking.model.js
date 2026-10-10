import { CALBOOKING_STATUS } from "../../../config/constants/calbooking.js";
import { ulid } from "ulid";

export default (sequelize, DataTypes) => {
  const CalBooking = sequelize.define(
    "CalBooking",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      bookingUid: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      iCalUID: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      eventTitle: {
        type: DataTypes.STRING,
      },

      eventType: {
        type: DataTypes.STRING,
      },

      startTime: {
        type: DataTypes.DATE,
      },

      endTime: {
        type: DataTypes.DATE,
      },

      attendeeName: {
        type: DataTypes.STRING,
      },

      attendeeEmail: {
        type: DataTypes.STRING,
      },

      attendeePhone: {
        type: DataTypes.STRING,
      },

      attendeeTimeZone: {
        type: DataTypes.STRING,
      },

      attendeeNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      rescheduleReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      cancellationReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      meetingUrl: {
        type: DataTypes.TEXT,
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: CALBOOKING_STATUS.BOOKED,
      },

      rawPayload: {
        type: DataTypes.JSONB,
      },
    },
    {
      tableName: "cal_bookings",
      timestamps: true,
    }
  );

  return CalBooking;
};
