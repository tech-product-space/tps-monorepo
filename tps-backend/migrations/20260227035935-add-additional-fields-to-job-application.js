'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('job_applications', 'currentCTC', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('job_applications', 'expectedCTC', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('job_applications', 'noticePeriod', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('job_applications', 'openToRelocate', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('job_applications', 'currentCTC');
    await queryInterface.removeColumn('job_applications', 'expectedCTC');
    await queryInterface.removeColumn('job_applications', 'noticePeriod');
    await queryInterface.removeColumn('job_applications', 'totalExperience');
    await queryInterface.removeColumn('job_applications', 'openToRelocate');
  }
};