import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import { emitEventFeedbackSubmitted } from "../../../services/leadEvent/emitters.js";

export default (sequelize) => {
  const EventFeedback = sequelize.define(
    "EventFeedback",
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

      guestId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // Keyed by the field `key` from config/constants/eventFeedbackForms.js.
      // Treat as immutable after insert — admin fixes go in `corrections`.
      responses: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      // Keyed by the ORIGINAL email so the raw answer stays readable:
      //   { "sam@gmial.com": { email, name, correctedBy, correctedAt, note } }
      // Always read teammates through readTeammates(), never straight off
      // `responses` — a second reader is how a corrected typo comes back.
      corrections: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      submittedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: "EventFeedbacks",
      timestamps: true,
      /**
       * Lead-event emitter. Fires here rather than in the controllers because
       * this row has more than one create path, and a trigger that silently
       * stops firing for one of them reads as "quiet", not as a bug.
       * Deferred to after-commit inside the emitter, so a rolled-back write
       * records nothing. See `services/leadEvent/`.
       */
      hooks: {
        afterCreate: (row, options) => emitEventFeedbackSubmitted(row, options),
      },
    },
  );

  EventFeedback.associate = (models) => {
    EventFeedback.belongsTo(models.Event, {
      foreignKey: "eventId",
      as: "event",
    });

    EventFeedback.belongsTo(models.EventGuest, {
      foreignKey: "guestId",
      as: "guest",
    });
  };

  return EventFeedback;
};
