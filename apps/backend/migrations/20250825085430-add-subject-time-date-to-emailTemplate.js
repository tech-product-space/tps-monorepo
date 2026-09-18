'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add subject
    await queryInterface.addColumn('EmailTemplates', 'subject', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add date
    await queryInterface.addColumn('EmailTemplates', 'date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    await queryInterface.addColumn('EmailTemplates', 'startTime', {
      type: Sequelize.TIME,
      allowNull: true,
    });

    await queryInterface.addColumn('EmailTemplates', 'endTime', {
      type: Sequelize.TIME,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('EmailTemplates', 'subject');
    await queryInterface.removeColumn('EmailTemplates', 'date');
    await queryInterface.removeColumn('EmailTemplates', 'startTime');
    await queryInterface.removeColumn('EmailTemplates', 'endTime');
  }
};
