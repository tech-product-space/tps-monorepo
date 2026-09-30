'use strict';

const { JOB_SOURCE } = require("../constants/jobs");

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('jobsBoards', 'jobSource', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: JOB_SOURCE.EXTERNAL
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobsBoards', 'jobSource');
  }
};