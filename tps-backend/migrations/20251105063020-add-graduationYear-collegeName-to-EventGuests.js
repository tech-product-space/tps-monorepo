'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('EventGuests', 'graduationYear', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('EventGuests', 'collegeName', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('EventGuests', 'graduationYear');
    await queryInterface.removeColumn('EventGuests', 'collegeName');
  }
};
