"use strict";

/**
 * Profile details a student fills in themselves at onboarding.theproductspace.in.
 *
 * A separate 1:1 table rather than columns on lead_profiles: that table is read
 * on nearly every lead query, and widening it with eighteen mostly-NULL columns
 * taxes the hottest path in the app for data that matters on one screen.
 *
 * lead_profile_id is the PRIMARY KEY, which is what makes the 1:1 structural
 * rather than conventional — there is no way to end up with two detail rows for
 * one person, so the re-submission path is a plain upsert.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("lead_profile_details", {
      lead_profile_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: "lead_profiles", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      /* — About you — */
      age: { type: Sequelize.SMALLINT, allowNull: true },
      current_city: { type: Sequelize.STRING(100), allowNull: true },
      career_status: {
        type: Sequelize.STRING(30),
        allowNull: true,
        comment: "in_college | working | career_break | other",
      },
      career_status_other: {
        type: Sequelize.STRING(150),
        allowNull: true,
        comment: "Free text, required only when career_status = 'other'",
      },

      /* — Studies / work — */
      org_name: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: "College OR company OR most recent employer — one field",
      },
      field_of_study: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: "'What are you studying?' — in_college only",
      },
      role_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "'Tell me about your role?' — working only",
      },
      total_experience_years: { type: Sequelize.DECIMAL(4, 1), allowNull: true },
      about_studies_job: { type: Sequelize.TEXT, allowNull: true },
      hobbies: { type: Sequelize.TEXT, allowNull: true },

      /* — Links — */
      linkedin_url: { type: Sequelize.STRING(500), allowNull: true },
      resume_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: "External link only. We never fetch it server-side (SSRF).",
      },

      /* — Attribution — */
      heard_about_us: { type: Sequelize.STRING(50), allowNull: true },
      heard_about_us_other: { type: Sequelize.STRING(150), allowNull: true },

      // Escape hatch for questions added later without a migration.
      extra: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /* — Provenance — */
      first_submitted_at: { type: Sequelize.DATE, allowNull: true },
      last_submitted_at: { type: Sequelize.DATE, allowNull: true },
      submission_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      submitted_phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: "The number that cleared OTP, as sent to WhatsApp",
      },
      submitted_ip: { type: Sequelize.STRING(64), allowNull: true },
      submitted_user_agent: { type: Sequelize.STRING(300), allowNull: true },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Range guards live in the DB as well as the service. The service is the
    // friendly error; these are the guarantee.
    await queryInterface.sequelize.query(`
      ALTER TABLE lead_profile_details
        ADD CONSTRAINT lead_profile_details_age_range
          CHECK (age IS NULL OR (age BETWEEN 15 AND 100)),
        ADD CONSTRAINT lead_profile_details_experience_range
          CHECK (total_experience_years IS NULL
                 OR (total_experience_years BETWEEN 0 AND 60))
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("lead_profile_details");
  },
};
