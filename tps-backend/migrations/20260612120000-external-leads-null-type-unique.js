"use strict";

/**
 * Leads from Meta forms with no lead-type mapping sync with type_id null.
 * The composite unique (external_lead_id, type_id) doesn't cover them —
 * Postgres treats NULLs as distinct — so without this partial index a race
 * between two syncs could duplicate a typeless lead.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("external_leads", ["external_lead_id"], {
      unique: true,
      name: "external_leads_lead_id_null_type_unique",
      where: { type_id: null },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "external_leads",
      "external_leads_lead_id_null_type_unique",
    );
  },
};
