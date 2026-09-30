"use strict";

/**
 * People who passed a recording's email gate.
 *
 * **One row per (recording, email)** — the unique index below is the whole
 * point, and it is a deliberate divergence from `ResourceLeads`, which inserts
 * one row per download.
 *
 * A download happens once. A recording's gate reappears for anyone on a new
 * device or with cleared storage, so the same person re-submits routinely;
 * unconditional inserts would make "2,341 leads" mostly the same few hundred
 * people, and every audience built on it wrong. A repeat submission bumps
 * `submissionCount` and returns the video, rather than 409ing at somebody who
 * did nothing wrong.
 *
 * `email` is stored lowercased by the model's setter, which is what makes the
 * unique index mean "one person" rather than "one spelling".
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("RecordingLeads", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      recordingId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "Recordings", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // The gate never requires an account; this is filled only when a
      // signed-in user happens to pass it.
      userId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      // Nullable because the gate asks for an address and nothing else. The
      // column exists so a richer form later needs no migration.
      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      countryCode: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      jobTitle: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      submissionCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      lastSubmittedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      additionalData: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("RecordingLeads", ["recordingId", "email"], {
      name: "recording_leads_recording_email_unique",
      unique: true,
    });

    // The person timeline looks people up by address across every recording.
    await queryInterface.addIndex("RecordingLeads", ["email"], {
      name: "recording_leads_email",
    });

    // The admin's per-recording lead list.
    await queryInterface.addIndex("RecordingLeads", ["recordingId", "createdAt"], {
      name: "recording_leads_recording_created_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("RecordingLeads");
  },
};
