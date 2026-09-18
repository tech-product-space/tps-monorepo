'use strict';

const { JOB_STATUS } = require("../constants/jobs");

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('jobsBoards', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: JOB_STATUS.PUBLISHED,
    });

    await queryInterface.addColumn('jobsBoards', 'repostedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('jobsBoards', 'repostCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // Back-fill: any legacy row hidden via the jobType='draft' hack becomes
    // status='draft'. Everything else is already public, so it stays 'published'
    // (the column default). jobType is left untouched — it still drives the
    // public Product/Engineering category tabs.
    await queryInterface.sequelize.query(
      `UPDATE "jobsBoards" SET "status" = :draft WHERE "jobType" = 'draft'`,
      { replacements: { draft: JOB_STATUS.DRAFT } }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('jobsBoards', 'repostCount');
    await queryInterface.removeColumn('jobsBoards', 'repostedAt');
    await queryInterface.removeColumn('jobsBoards', 'status');
  }
};
