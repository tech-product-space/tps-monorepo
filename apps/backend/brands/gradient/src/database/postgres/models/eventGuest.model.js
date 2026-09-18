import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import {
  EVENT_ATTENDEE_TYPE,
  EVENT_GUEST_STATUS,
} from "../../../config/constants/eventGuest.js";
import { emitEventRegistered } from "../../../services/leadEvent/emitters.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";

export default (sequelize) => {
  const EventGuest = sequelize.define(
    "EventGuest",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      eventId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      userId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      isAccountLinked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false, // true once userId is attached post-login
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: true, 
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      countryCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      attendeeType: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(EVENT_ATTENDEE_TYPE)],
        },
      },

      role: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      collegeName: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      graduationYear: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      referralCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      referrerUserId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      linkedinUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EVENT_GUEST_STATUS.WAITLISTED,
        validate: {
          isIn: [Object.values(EVENT_GUEST_STATUS)],
        },
      },

      statusUpdatedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      statusUpdatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      additionalData: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      tableName: "EventGuests",
      timestamps: true,
      /**
       * Lead-event emitter. Fires here rather than in the controllers because
       * this row has more than one create path, and a trigger that silently
       * stops firing for one of them reads as "quiet", not as a bug.
       * Deferred to after-commit inside the emitter, so a rolled-back write
       * records nothing. See `services/leadEvent/`.
       */
      hooks: {
        afterCreate: (guest, options) => {
          emitEventRegistered(guest, options);
          emitTriggerEvent("eventGuests", guest, options);
        },
        afterBulkCreate: (guests, options) => {
          for (const guest of guests) {
            emitEventRegistered(guest, options);
            emitTriggerEvent("eventGuests", guest, options);
          }
        },
      },
    },
  );

  EventGuest.associate = (models) => {
    EventGuest.belongsTo(models.Event, {
      foreignKey: "eventId",
      as: "event",
    });

    EventGuest.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });

    EventGuest.belongsTo(models.AdminUser, {
      foreignKey: "statusUpdatedBy",
      as: "statusUpdatedAdmin",
    });

    EventGuest.belongsTo(models.User, {
      foreignKey: "referrerUserId",
      as: "referrer",
    });

    EventGuest.hasOne(models.EventFeedback, {
      foreignKey: "guestId",
      as: "feedback",
    });

    EventGuest.hasOne(models.EventCertificate, {
      foreignKey: "guestId",
      as: "certificate",
    });
  };

  return EventGuest;
};
