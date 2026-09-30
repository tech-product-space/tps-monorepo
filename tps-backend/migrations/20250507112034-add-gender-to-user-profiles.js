'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('user_profiles', 'gender', {
      type: Sequelize.STRING,
      allowNull: true, // set false if required
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('user_profiles', 'gender');
  }
};