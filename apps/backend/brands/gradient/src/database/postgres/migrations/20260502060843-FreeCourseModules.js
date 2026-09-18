'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('FreeCourseModules', {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      freeCourseId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subTitle: Sequelize.STRING,

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      overview: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },

      order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      seo: {
        type: Sequelize.JSONB,
        allowNull: true,
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
    await queryInterface.dropTable('FreeCourseModules');
  },
};