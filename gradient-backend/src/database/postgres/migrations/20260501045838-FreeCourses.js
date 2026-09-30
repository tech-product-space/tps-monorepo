'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('FreeCourses', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      title: Sequelize.STRING,
      subTitle: Sequelize.STRING,

      description: Sequelize.TEXT,

      author: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },

      curriculum: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },

      whatYouWillLearn: {
        type: Sequelize.JSONB, // { title: "", points: [] }
        defaultValue: {},
      },

      whoShouldAttend: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },

      certificate: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },

      rightCard: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },

      thumbnail: Sequelize.STRING,

      seo: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      slug: {
        type: Sequelize.STRING,
        unique: true,
      },

      faq: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
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
    await queryInterface.dropTable('FreeCourses');
  },
};