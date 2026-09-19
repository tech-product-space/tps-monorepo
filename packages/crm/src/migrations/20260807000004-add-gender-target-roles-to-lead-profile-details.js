"use strict";

/**
 * Three questions added to the onboarding form on 2026-08-07.
 *
 *  - gender             : asked in "About you", alongside age and city
 *  - target_roles       : what they want to be doing after the programme. A
 *                         real ARRAY rather than JSONB or a comma-joined string
 *                         so "who wants a PM role" is an indexable query
 *                         (`'pm' = ANY(target_roles)`) rather than a LIKE over
 *                         text — the same choice lead_profiles.interested_products
 *                         already makes.
 *  - target_role_other  : free text, only when "Other" is one of the picks
 *
 * No column for the career-break employer: those students fill org_name and
 * role_description like everyone else, and the portal just relabels the two in
 * the past tense. A dedicated pair would be null for three statuses out of four
 * and would split "where has this person worked?" across two places.
 *
 * All nullable and target_roles defaults to empty: every existing row predates
 * these questions, and a student is only asked for them the next time they open
 * the form. Nothing backfills.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("lead_profile_details", "gender", {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: "male | female | other — see config/constants/onboarding.js",
    });

    await queryInterface.addColumn("lead_profile_details", "target_roles", {
      type: Sequelize.ARRAY(Sequelize.STRING(30)),
      allowNull: false,
      defaultValue: [],
      comment: "Roles they're targeting post-programme; multi-select",
    });

    await queryInterface.addColumn("lead_profile_details", "target_role_other", {
      type: Sequelize.STRING(150),
      allowNull: true,
      comment: "Free text, only meaningful when target_roles contains 'other'",
    });

    // Every "who is targeting X?" question is a containment test, and GIN is
    // what makes that an index lookup instead of a sequential scan.
    await queryInterface.addIndex("lead_profile_details", ["target_roles"], {
      using: "GIN",
      name: "lead_profile_details_target_roles_gin",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "lead_profile_details",
      "lead_profile_details_target_roles_gin",
    );
    await queryInterface.removeColumn("lead_profile_details", "target_role_other");
    await queryInterface.removeColumn("lead_profile_details", "target_roles");
    await queryInterface.removeColumn("lead_profile_details", "gender");
  },
};
