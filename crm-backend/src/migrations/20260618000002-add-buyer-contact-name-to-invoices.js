'use strict';

/**
 * Contact person on the buyer (e.g. the lead) — shown alongside a custom
 * business buyer so the invoice still carries the individual's name.
 *
 * Split out from 20260618000001 because that migration had already been applied
 * before this column was needed; Sequelize won't re-run an applied migration.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'buyer_contact_name', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'buyer_contact_name');
  },
};
