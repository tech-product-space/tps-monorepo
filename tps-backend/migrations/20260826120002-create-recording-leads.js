"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("RecordingLeads", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      recordingId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "Recordings", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // users.id is an INTEGER here, unlike every other id in this feature.
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
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
      attendeeType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      collegeName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      graduationYear: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      linkedinUrl: {
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
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // One row per person per recording. This is the guarantee that keeps
    // "leads" a count of people rather than of page loads — it survives a
    // concurrent double-submit, which the controller's lookup cannot.
    await queryInterface.addIndex("RecordingLeads", ["recordingId", "email"], {
      unique: true,
      name: "recording_leads_recording_id_email_unique",
    });

    // Person-timeline lookups across recordings.
    await queryInterface.addIndex("RecordingLeads", ["email"]);

    // The per-recording lead list in the admin panel.
    await queryInterface.sequelize.query(
      `CREATE INDEX "recording_leads_recording_id_created_at"
         ON "RecordingLeads" ("recordingId", "createdAt" DESC)`
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("RecordingLeads");
  },
};
