'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('FreeCourseLessons', {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      freeCourseModuleId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      content: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      seo: {
        type: Sequelize.JSONB,
        defaultValue: {},
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
    await queryInterface.dropTable('FreeCourseLessons');
  },
};