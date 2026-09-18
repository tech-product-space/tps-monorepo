'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PortfolioProjects', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      projectName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
      },
      problemStatement: {
        type: Sequelize.TEXT,
      },
      goals: {
        type: Sequelize.TEXT,
      },
      skills: {
        type: Sequelize.STRING,
      },
      tools: {
        type: Sequelize.STRING,
      },
      tag: {
        type: Sequelize.STRING,
      },
      mediaUrl: {
        type: Sequelize.STRING,
      },
      documentUrl: {
        type: Sequelize.STRING,
      },
      submittedAt: {
        type: Sequelize.DATE,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('PortfolioProjects');
  },
};
