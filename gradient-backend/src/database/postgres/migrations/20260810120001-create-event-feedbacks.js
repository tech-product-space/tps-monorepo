"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventFeedbacks", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      eventId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "Events",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      guestId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "EventGuests",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // Answers keyed by the field `key` in config/constants/eventFeedbackForms.js.
      // Never mutated after insert — it is the record of what the person typed.
      responses: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      // Admin fixes layered over `responses` at read time, keyed by the ORIGINAL
      // (typo'd) email so the raw answer stays intact:
      //   { "sam@gmial.com": { email, name, correctedBy, correctedAt, note } }
      // The recipient resolver reads responses through this; without it a
      // corrected address regresses on the next resolve and issues twice.
      corrections: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      submittedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // One submission per guest per event.
    await queryInterface.addConstraint("EventFeedbacks", {
      fields: ["eventId", "guestId"],
      type: "unique",
      name: "event_feedbacks_event_id_guest_id_unique",
    });

    await queryInterface.addIndex("EventFeedbacks", ["eventId", "submittedAt"], {
      name: "event_feedbacks_event_id_submitted_at_idx",
    });

    // Backs the "has my team already submitted?" check, which asks whether an
    // email appears inside a teammate group of any submission for the event.
    await queryInterface.addIndex("EventFeedbacks", ["responses"], {
      name: "event_feedbacks_responses_gin_idx",
      using: "gin",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("EventFeedbacks");
  },
};
