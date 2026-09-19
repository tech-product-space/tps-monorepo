'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('jobsBoards', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      title: Sequelize.TEXT,
      location: Sequelize.TEXT,

      postedAt: Sequelize.DATE,

      applyUrl: Sequelize.TEXT,
      link: Sequelize.TEXT,
      inputUrl: Sequelize.TEXT,

      trackingId: Sequelize.TEXT,
      refId: Sequelize.TEXT,

      applicantsCount: Sequelize.TEXT,

      employmentType: Sequelize.TEXT,
      seniorityLevel: Sequelize.TEXT,
      jobFunction: Sequelize.TEXT,
      industries: Sequelize.TEXT,

      salaryInfo: Sequelize.JSONB,
      benefits: Sequelize.JSONB,

      descriptionHtml: Sequelize.TEXT,
      descriptionText: Sequelize.TEXT,

      companyName: Sequelize.TEXT,
      companyLogo: Sequelize.TEXT,
      companyDescription: Sequelize.TEXT,
      companyWebsite: Sequelize.TEXT,

      companyEmployeesCount: Sequelize.INTEGER,

      companyLinkedinUrl: Sequelize.TEXT,

      companyAddress: Sequelize.JSONB,

      jobType: Sequelize.STRING,
      uploadedBy: Sequelize.STRING,

      jobSource: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'EXTERNAL', // match your JOB_SOURCE
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('jobsBoards');
  },
};
