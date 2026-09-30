"use strict";

const { ulid } = require("ulid");
const { fireAfterCreate } = require("../service/workflow/triggers/hookHelper");
const { RECORDING_LEAD_SOURCE } = require("../constants/recording");

/**
 * Somebody who passed a recording's email gate.
 *
 * **One row per (recording, email), not one per submission.** `ResourceLeads`
 * inserts unconditionally, which is right for a download. A recording's gate
 * reappears for anyone on a new device or with cleared storage, so the same
 * person re-submits routinely — unconditional inserts would make "2,341 leads"
 * mostly the same few hundred people. A repeat bumps `submissionCount` and
 * `lastSubmittedAt` and returns 200 with the video URL; it is not a 409.
 *
 * `email` is stored lowercased, the key every audience in this system uses.
 */
module.exports = (sequelize, DataTypes) => {
  const RecordingLead = sequelize.define(
    "RecordingLead",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      recordingId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /**
       * Filled when a signed-in user passes the gate. The gate itself never
       * requires an account — see `middlewares/optionalUser.js`.
       */
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          this.setDataValue(
            "email",
            typeof value === "string" ? value.trim().toLowerCase() : value
          );
        },
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      countryCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * The form's "Current role / company".
       *
       * `EventGuests` calls this `role`; it is the same fact and it is a job
       * title, so the gate maps it into this column rather than growing a second
       * one. `createRecordingLead` does the mapping, and it is the only place
       * that should.
       */
      jobTitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * "Professional" or "Student" — the toggle that decides which of the two
       * fields below the form requires. Not an ENUM: `EventGuests` stores it as
       * a plain string, and an ENUM here would need a migration every time that
       * list grew, for a value validated on the way in anyway.
       */
      attendeeType: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Students only. Null for a professional. */
      collegeName: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Students only. A string, matching `EventGuests`. */
      graduationYear: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      linkedinUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * When these details were last **typed**, by this person, into the form.
       *
       * Not `createdAt`, and the difference is the whole point. A row created
       * by the carry path holds details typed weeks or months earlier, so its
       * creation date says nothing about how current they are. This is copied
       * forward unchanged by a carry and reset only by a real submission — it
       * travels with the data, not with the row.
       *
       * Read only through `isRecordingProfileStale()`, which treats null as
       * stale: a row that somehow arrives without one should ask for a
       * confirmation rather than pass as fresh.
       */
      detailsConfirmedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /**
       * `"form"` when a person filled the gate for this recording, `"carried"`
       * when they clicked play and their profile was copied across.
       *
       * The freshness logic does not read this. It exists so the leads table
       * does not present the two as the same thing — one is somebody choosing
       * to hand over their details for this session, the other is a click.
       */
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: RECORDING_LEAD_SOURCE.FORM,
      },

      /** How many times this address has re-passed the gate. Not views. */
      submissionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      lastSubmittedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      /** UTM, referrer, anything the form grows. */
      additionalData: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      tableName: "RecordingLeads",
      timestamps: true,
      /**
       * The workflow trigger. In the model rather than the controller because
       * this row has more than one create path, and a trigger that silently
       * stops firing for one of them reads as "quiet", not as a bug.
       * `fireAfterCreate` defers to after-commit, so a rolled-back write
       * enqueues nothing.
       *
       * Only `afterCreate` fires it. A repeat gate pass updates an existing row,
       * and re-enrolling somebody every time they open a recording on a new
       * phone would put them through the same nurture sequence twice.
       */
      hooks: {
        afterCreate: (row, options) =>
          fireAfterCreate("recordings", row.id, options),
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            fireAfterCreate("recordings", row.id, options);
          }
        },
      },
    }
  );

  RecordingLead.associate = (models) => {
    RecordingLead.belongsTo(models.Recording, {
      foreignKey: "recordingId",
      as: "recording",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    RecordingLead.belongsTo(models.users, {
      foreignKey: "userId",
      as: "user",
    });
  };

  return RecordingLead;
};
