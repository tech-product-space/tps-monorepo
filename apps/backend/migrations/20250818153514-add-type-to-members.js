'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('members', 'type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'pm_fellowship',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('members', 'type');
  }
};
