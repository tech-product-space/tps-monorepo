'use strict';

/**
 * Enable soft-delete (Sequelize `paranoid`) on products and subsources.
 * Existing rows get NULL = not deleted. No data backfill needed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('subsources', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'deleted_at');
    await queryInterface.removeColumn('subsources', 'deleted_at');
  },
};
