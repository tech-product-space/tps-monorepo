'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('FreeCourseLessonProgress', {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      userId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      freeCourseLessonId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

  async down(queryInterface) {
    await queryInterface.dropTable('FreeCourseLessonProgress');
  },
};