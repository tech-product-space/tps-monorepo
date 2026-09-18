'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('EventGuests', 'feedbackData', {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    await queryInterface.addColumn('EventGuests', 'feedbackSubmittedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('EventGuests', 'feedbackSubmittedAt');
    await queryInterface.removeColumn('EventGuests', 'feedbackData');
  },
};
