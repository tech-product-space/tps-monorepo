'use strict';

/**
 * International payments — payments money precision + settlement columns.
 *
 *  - `amount` → DECIMAL(14,3): the presentment amount (what the customer was
 *    charged, in `currency`). Existing INR integer rows stay valid.
 *  - `base_amount` / `base_currency`: the INR settlement reported by the
 *    gateway webhook (Razorpay's `base_amount` / `base_currency`). For domestic
 *    INR payments base_amount === amount. All revenue reporting sums
 *    base_amount so mixed-currency totals stay coherent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('payments', 'amount', {
      type: Sequelize.DECIMAL(14, 3),
      allowNull: false,
    });

    await queryInterface.addColumn('payments', 'base_amount', {
      type: Sequelize.DECIMAL(14, 3),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('payments', 'base_currency', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    });

    // Backfill settlement for existing (INR) payments: base_amount = amount.
    await queryInterface.sequelize.query(
      `UPDATE payments SET base_amount = amount WHERE base_amount IS NULL`,
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('payments', 'base_currency');
    await queryInterface.removeColumn('payments', 'base_amount');
    await queryInterface.changeColumn('payments', 'amount', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
