'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Make lead_id nullable for profile-level activities (like payments)
    await queryInterface.changeColumn('activities', 'lead_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('activities', 'lead_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};
