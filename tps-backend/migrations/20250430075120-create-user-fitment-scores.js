'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_fitment_scores', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      role_fitment_score: {
        type: Sequelize.STRING
      },
      strength_1: {
        type: Sequelize.STRING
      },
      strength_2: {
        type: Sequelize.STRING
      },
      strength_3: {
        type: Sequelize.STRING
      },
      weakness_1: {
        type: Sequelize.STRING
      },
      weakness_2: {
        type: Sequelize.STRING
      },
      weakness_3: {
        type: Sequelize.STRING
      },
      resume_improvement_1: {
        type: Sequelize.STRING
      },
      resume_improvement_2: {
        type: Sequelize.STRING
      },
      resume_improvement_3: {
        type: Sequelize.STRING
      },
      overall_relevance_score: {
        type: Sequelize.FLOAT
      },
      companyName: {
        type: Sequelize.STRING
      },
      jobDescription: {
        type: Sequelize.STRING
      },
      resumeUrl: {
        type: Sequelize.STRING
      },
      userId: {
        type: Sequelize.INTEGER
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
    await queryInterface.dropTable('user_fitment_scores');
  }
};