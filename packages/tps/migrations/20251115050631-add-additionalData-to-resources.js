'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.addColumn(
        'Resources', 
        'additionalData',
        {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {},
        },
        { transaction: t }
      );
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.removeColumn('Resources', 'additionalData', { transaction: t });
    });
  },
};
