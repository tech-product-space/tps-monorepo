'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('referrals', 'type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'student',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('referrals', 'type');
  }
};
