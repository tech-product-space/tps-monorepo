'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('jobsBoards', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.STRING
      },
      title: {
        type: Sequelize.TEXT
      },
      location: {
        type: Sequelize.TEXT
      },
      postedAt: {
        type: Sequelize.DATE
      },
      applyUrl: {
        type: Sequelize.TEXT
      },
      link: {
        type: Sequelize.TEXT
      },
      inputUrl: {
        type: Sequelize.TEXT
      },
      trackingId: {
        type: Sequelize.STRING
      },
      refId: {
        type: Sequelize.STRING
      },
      applicantsCount: {
        type: Sequelize.STRING
      },
      employmentType: {
        type: Sequelize.TEXT
      },
      seniorityLevel: {
        type: Sequelize.TEXT
      },
      jobFunction: {
        type: Sequelize.TEXT
      },
      industries: {
        type: Sequelize.TEXT
      },
      salaryInfo: {
        type: Sequelize.TEXT
      },
      benefits: {
        type: Sequelize.TEXT
      },
      descriptionHtml: {
        type: Sequelize.TEXT
      },
      descriptionText: {
        type: Sequelize.TEXT
      },
      companyName: {
        type: Sequelize.TEXT
      },
      companyLogo: {
        type: Sequelize.TEXT
      },
      companyDescription: {
        type: Sequelize.TEXT
      },
      companyWebsite: {
        type: Sequelize.TEXT
      },
      companyEmployeesCount: {
        type: Sequelize.INTEGER
      },
      companyLinkedinUrl: {
        type: Sequelize.TEXT
      },
      companyAddress: {
        type: Sequelize.TEXT
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('jobsBoards');
  }
};