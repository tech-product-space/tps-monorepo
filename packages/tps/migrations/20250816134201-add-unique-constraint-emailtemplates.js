'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('EmailTemplates', {
      fields: ['eventId', 'type'],
      type: 'unique',
      name: 'unique_event_type'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('EmailTemplates', 'unique_event_type');
  }
};