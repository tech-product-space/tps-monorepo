'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ProgramOffers', 'offer_valid_for', {
      type: Sequelize.TEXT,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ProgramOffers', 'offer_valid_for', {
      type: Sequelize.INTEGER,
    });
  }
};
