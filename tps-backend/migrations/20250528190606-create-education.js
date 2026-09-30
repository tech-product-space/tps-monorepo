'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Education', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: {
        type: Sequelize.INTEGER
      },
      institution: {
        type: Sequelize.STRING
      },
      degree: {
        type: Sequelize.STRING
      },
      startMonth: {
        type: Sequelize.STRING
      },
      startYear: {
        type: Sequelize.STRING
      },
      endMonth: {
        type: Sequelize.STRING
      },
      endYear: {
        type: Sequelize.STRING
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
    await queryInterface.dropTable('Education');
  }
};