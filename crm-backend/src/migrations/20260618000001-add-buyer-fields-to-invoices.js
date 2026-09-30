'use strict';

/**
 * Custom buyer (billing) details captured at invoice-issue time.
 *
 * An invoice can be billed to the lead's own profile ("profile") or to a
 * different entity such as the lead's employer/business ("custom"). When
 * custom, the buyer's GSTIN / address / phone are frozen onto the invoice so
 * the PDF renders the billed entity, not the lead profile.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'buyer_type', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'profile',
    });
    await queryInterface.addColumn('invoices', 'buyer_gstin', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addColumn('invoices', 'buyer_address', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('invoices', 'buyer_phone', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'buyer_phone');
    await queryInterface.removeColumn('invoices', 'buyer_address');
    await queryInterface.removeColumn('invoices', 'buyer_gstin');
    await queryInterface.removeColumn('invoices', 'buyer_type');
  },
};
