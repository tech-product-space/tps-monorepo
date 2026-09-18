'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Payment source for manually-recorded payments.
    await queryInterface.addColumn('payments', 'source', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
    });

    // External transaction reference (bank UTR / Razorpay / Cashfree txn id).
    await queryInterface.addColumn('payments', 'reference', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    // Free-text internal note about the payment.
    await queryInterface.addColumn('payments', 'note', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('payments', 'source');
    await queryInterface.removeColumn('payments', 'reference');
    await queryInterface.removeColumn('payments', 'note');
  },
};
