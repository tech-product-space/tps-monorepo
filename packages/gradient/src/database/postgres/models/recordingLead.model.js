import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import { emitRecordingWatched } from "../../../services/leadEvent/emitters.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";
import { RECORDING_LEAD_SOURCE } from "../../../config/constants/recording.js";

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
export default (sequelize) => {
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
       * The account that passed the gate. Required in practice — the gate is
       * behind `authMiddleware` — but the column stays nullable for the rows
       * written before that was true, and because `onDelete: SET NULL` has to
       * be able to land somewhere when an account is removed.
       *
       * The profile lookup keys on this first and falls back to `email`, which
       * is what stops every pre-account row from being re-asked for details it
       * already holds.
       */
      userId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * Nullable on purpose — the gate in the design asks for an address and
       * nothing else. The column exists so a future variant of the form can ask
       * for more without a migration.
       */
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
            typeof value === "string" ? value.trim().toLowerCase() : value,
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
       * title, so it keeps the column that was already here rather than
       * gaining a second one. `createRecordingLead` does the mapping, and it is
       * the only place that should.
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

      /** Students only. Null for a professional, and for every pre-form row. */
      collegeName: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Students only. A string, matching `EventGuests` — see the migration. */
      graduationYear: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Optional on the form, and validated as a linkedin.com URL when given. */
      linkedinUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * When a **human** last typed or confirmed these details.
       *
       * Not `createdAt`, and the difference is the whole point. A row created
       * by the carry path holds details typed weeks or months ago, so its
       * creation date says nothing about how current they are. This is copied
       * forward unchanged by a carry and reset only by a real submission —
       * it travels with the data, not with the row.
       *
       * Read only through `isRecordingProfileStale()`, which treats null as
       * stale: a row that somehow arrives without one should ask for a
       * confirmation, not pass as fresh.
       */
      detailsConfirmedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /**
       * `"form"` when a person filled the gate for this recording, `"carried"`
       * when they clicked play and we copied a profile across.
       *
       * The freshness logic does not read this. It exists so the lead table
       * does not present the two as the same thing — one is a person choosing
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
       * Lead-event and workflow emitters. In the model rather than the
       * controller because this row has more than one create path, and a
       * trigger that silently stops firing for one of them reads as "quiet",
       * not as a bug. Both defer to after-commit inside the emitter, so a
       * rolled-back write records nothing.
       *
       * Only `afterCreate` fires them. A repeat gate pass updates an existing
       * row, and re-announcing "watched a recording" every time somebody opens
       * it on a new phone would put noise on the timeline and re-enrol them in
       * the same workflow.
       */
      hooks: {
        afterCreate: (row, options) => {
          emitRecordingWatched(row, options);
          emitTriggerEvent("recordingLeads", row, options);
        },
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            emitRecordingWatched(row, options);
            emitTriggerEvent("recordingLeads", row, options);
          }
        },
      },
    },
  );

  RecordingLead.associate = (models) => {
    RecordingLead.belongsTo(models.Recording, {
      foreignKey: "recordingId",
      as: "recording",
    });

    RecordingLead.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });
  };

  return RecordingLead;
};
