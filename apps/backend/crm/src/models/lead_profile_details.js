"use strict";
const { Model } = require("sequelize");

/**
 * What a student told us about themselves at onboarding.theproductspace.in.
 *
 * 1:1 with LeadProfile — lead_profile_id IS the primary key, so re-submission
 * is an upsert and there is no way to accumulate duplicate rows for one person.
 *
 * Nothing here is written by CRM staff. The only writer is the public
 * onboarding router, through onboardingPortal.service.submitDetails, and it
 * writes an explicit field allowlist (never a req.body spread).
 */
module.exports = (sequelize, DataTypes) => {
  class LeadProfileDetails extends Model {
    static associate(models) {
      LeadProfileDetails.belongsTo(models.LeadProfile, {
        foreignKey: "lead_profile_id",
        as: "LeadProfile",
      });
    }
  }

  LeadProfileDetails.init(
    {
      lead_profile_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },

      age: { type: DataTypes.SMALLINT, allowNull: true },
      gender: { type: DataTypes.STRING(20), allowNull: true },
      current_city: { type: DataTypes.STRING(100), allowNull: true },
      career_status: { type: DataTypes.STRING(30), allowNull: true },
      career_status_other: { type: DataTypes.STRING(150), allowNull: true },

      // Where they work, study, or last worked — the portal labels it by
      // career status ("College name" / "Company name" / "Previous company").
      org_name: { type: DataTypes.STRING(200), allowNull: true },
      field_of_study: { type: DataTypes.STRING(200), allowNull: true },
      // A job title since 2026-08-07, not the paragraph it used to be. Left as
      // TEXT rather than narrowed to STRING(200): rows written under the old
      // rules may be longer, and a column change would truncate them.
      // Read in the past tense for a career break — same column, relabelled.
      role_description: { type: DataTypes.TEXT, allowNull: true },

      // DECIMAL comes back from pg as a string; the getter normalises so
      // JSON responses and any future aggregation stay numeric — same pattern
      // as the money columns on LeadCourse.
      total_experience_years: {
        type: DataTypes.DECIMAL(4, 1),
        allowNull: true,
        get() {
          const v = this.getDataValue("total_experience_years");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      about_studies_job: { type: DataTypes.TEXT, allowNull: true },
      hobbies: { type: DataTypes.TEXT, allowNull: true },

      linkedin_url: { type: DataTypes.STRING(500), allowNull: true },
      resume_url: { type: DataTypes.STRING(500), allowNull: true },

      // What they want to be doing after the programme. A real ARRAY so
      // "who is targeting a PM role?" is `'pm' = ANY(target_roles)` against a
      // GIN index, not a LIKE over a joined string.
      target_roles: {
        type: DataTypes.ARRAY(DataTypes.STRING(30)),
        allowNull: false,
        defaultValue: [],
      },
      target_role_other: { type: DataTypes.STRING(150), allowNull: true },

      heard_about_us: { type: DataTypes.STRING(50), allowNull: true },
      heard_about_us_other: { type: DataTypes.STRING(150), allowNull: true },

      // Alternate contact details, self-reported. The primary phone is the one
      // that cleared OTP and the primary email lives on lead_profiles — neither
      // is editable from the portal.
      secondary_email: { type: DataTypes.STRING(255), allowNull: true },
      secondary_phone: { type: DataTypes.STRING(20), allowNull: true },
      secondary_country_code: { type: DataTypes.STRING(10), allowNull: true },

      extra: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      first_submitted_at: { type: DataTypes.DATE, allowNull: true },
      last_submitted_at: { type: DataTypes.DATE, allowNull: true },
      submission_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      submitted_phone: { type: DataTypes.STRING(20), allowNull: true },
      submitted_ip: { type: DataTypes.STRING(64), allowNull: true },
      submitted_user_agent: { type: DataTypes.STRING(300), allowNull: true },
    },
    {
      sequelize,
      modelName: "LeadProfileDetails",
      tableName: "lead_profile_details",
      underscored: true,
    },
  );

  return LeadProfileDetails;
};
