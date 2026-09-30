'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('job_applications', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      name: Sequelize.STRING,
      email: Sequelize.STRING,
      resume: Sequelize.STRING,
      phoneNumber: Sequelize.STRING,
      linkedinProfile: Sequelize.STRING,
      role: Sequelize.STRING,
      jobId: {
        type: Sequelize.STRING,
        allowNull: false
      },
      yearsOfExperience: Sequelize.STRING,
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add unique constraint on (userId, jobId)
    await queryInterface.addConstraint('job_applications', {
      fields: ['userId', 'jobId'],
      type: 'unique',
      name: 'unique_user_job_application'
    });
  }
  ,
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('job_applications');
  }
};
