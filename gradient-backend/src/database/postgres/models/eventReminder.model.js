import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import { 
    EVENT_REMINDER_ATTENDEE_TYPE, EVENT_REMINDER_STATUS, EVENT_REMINDER_TARGET_STATUS 
} from "../../../config/constants/eventReminder.js";

export default (sequelize) => {
  const EventReminder = sequelize.define(
    "EventReminder",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      eventId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      subject: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      senderEmail: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },

      targetStatus: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [Object.values(EVENT_REMINDER_TARGET_STATUS)],
        },
      },

      targetAttendeeType: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [Object.values(EVENT_REMINDER_ATTENDEE_TYPE)],
        },
      },

      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EVENT_REMINDER_STATUS.PENDING,
        validate: {
          isIn: [Object.values(EVENT_REMINDER_STATUS)],
        },
      },

      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /**
       * Delivery counts from the last run. Without them a reminder where every
       * send failed is indistinguishable from one that went out cleanly.
       */
      totalSent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      totalFailed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      createdBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      updatedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "EventReminders",
      timestamps: true,
    },
  );

  EventReminder.associate = (models) => {
    EventReminder.belongsTo(models.Event, {
      foreignKey: "eventId",
      as: "event",
    });

    EventReminder.belongsTo(models.AdminUser, {
      foreignKey: "createdBy",
      as: "createdAdmin",
    });

    EventReminder.belongsTo(models.AdminUser, {
      foreignKey: "updatedBy",
      as: "updatedAdmin",
    });
  };

  return EventReminder;
};
