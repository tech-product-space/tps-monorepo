'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add "type" column
    await queryInterface.addColumn('user_profiles', 'type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'profile',
    });

    // 2. Remove old unique constraint on user_id (if exists)
    await queryInterface.removeConstraint('user_profiles', 'unique_user_profiles_user_id').catch(() => {});

    // 3. Add new composite unique constraint on user_id + type
    await queryInterface.addConstraint('user_profiles', {
      fields: ['user_id', 'type'],
      type: 'unique',
      name: 'unique_user_profiles_user_id_type'
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert all changes
    await queryInterface.removeConstraint('user_profiles', 'unique_user_profiles_user_id_type');
    await queryInterface.removeColumn('user_profiles', 'type');

    // (Optional) Re-add old unique constraint if needed
    await queryInterface.addConstraint('user_profiles', {
      fields: ['user_id'],
      type: 'unique',
      name: 'unique_user_profiles_user_id'
    });
  }
};
