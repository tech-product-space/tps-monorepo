"use strict";

/**
 * A Meta lead form can be mapped to multiple lead types, and each mapped
 * type must get its own external_leads row for the same Meta lead. The
 * original global unique on external_lead_id silently dropped every row
 * after the first type, so uniqueness moves to (external_lead_id, type_id).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint(
      "external_leads",
      "external_leads_external_lead_id_key",
    );

    await queryInterface.addConstraint("external_leads", {
      fields: ["external_lead_id", "type_id"],
      type: "unique",
      name: "external_leads_lead_id_type_id_unique",
    });
  },

  // Down will fail if any lead already has rows in more than one type —
  // those rows must be deleted manually before the global unique can return.
  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "external_leads",
      "external_leads_lead_id_type_id_unique",
    );

    await queryInterface.addConstraint("external_leads", {
      fields: ["external_lead_id"],
      type: "unique",
      name: "external_leads_external_lead_id_key",
    });
  },
};
