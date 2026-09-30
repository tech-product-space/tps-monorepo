'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('user_profiles', {
      fields: ['user_id'],
      type: 'unique',
      name: 'unique_user_profiles_user_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('user_profiles', 'unique_user_profiles_user_id');
  }
};
