"use strict";

/**
 * An alternate way to reach a student, given by the student.
 *
 * These live here rather than on lead_profiles for the same reason the rest of
 * this table does: lead_profiles.phone is the deduplication key and its email is
 * curated by agents, and the onboarding portal is an anonymous endpoint. It may
 * record what a student says about themselves; it may not edit the record the
 * CRM matches and merges on.
 *
 * The country code is stored beside the number rather than baked into it,
 * matching how lead_profiles keeps phone and country_code apart — a stored
 * "+919876543210" is ambiguous about where the code ends.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("lead_profile_details", "secondary_email", {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: "Alternate email, self-reported. Never the primary — see lead_profiles.email",
    });

    await queryInterface.addColumn("lead_profile_details", "secondary_phone", {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: "Alternate number, national form. Not the OTP-verified one",
    });

    await queryInterface.addColumn(
      "lead_profile_details",
      "secondary_country_code",
      {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: "Dial code for secondary_phone, e.g. '+91'",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "lead_profile_details",
      "secondary_country_code",
    );
    await queryInterface.removeColumn("lead_profile_details", "secondary_phone");
    await queryInterface.removeColumn("lead_profile_details", "secondary_email");
  },
};
