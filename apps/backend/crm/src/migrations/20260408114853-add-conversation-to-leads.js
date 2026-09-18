'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leads', 'conversation', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: []
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('leads', 'conversation');
  }
};