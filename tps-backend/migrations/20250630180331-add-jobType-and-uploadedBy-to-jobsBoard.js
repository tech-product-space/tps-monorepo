'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('jobsBoards', 'jobType', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('jobsBoards', 'uploadedBy', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('jobsBoards', 'jobType');
    await queryInterface.removeColumn('jobsBoards', 'uploadedBy');
  }
};
