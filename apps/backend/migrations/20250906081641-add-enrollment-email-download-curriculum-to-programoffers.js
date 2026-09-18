'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ProgramOffers', 'enrollmentEmail', {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    await queryInterface.addColumn('ProgramOffers', 'downloadCurriculum', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('ProgramOffers', 'enrollmentEmail');
    await queryInterface.removeColumn('ProgramOffers', 'downloadCurriculum');
  }
};
