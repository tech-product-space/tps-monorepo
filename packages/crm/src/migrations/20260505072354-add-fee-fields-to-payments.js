'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'fee_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('payments', 'fees', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('payments', 'tax', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('payments', 'fee_type');
    await queryInterface.removeColumn('payments', 'fees');
    await queryInterface.removeColumn('payments', 'tax');
  }
};