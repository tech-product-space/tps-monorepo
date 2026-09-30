'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add phone column
    await queryInterface.addColumn('referrals', 'phone', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Modify email column to allow null
    await queryInterface.changeColumn('referrals', 'email', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove phone column
    await queryInterface.removeColumn('referrals', 'phone');

    // Revert email to not allow null (if needed)
    await queryInterface.changeColumn('referrals', 'email', {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};
