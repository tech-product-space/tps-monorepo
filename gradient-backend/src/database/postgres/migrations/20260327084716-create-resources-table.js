'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Resources', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },
      resourceType: Sequelize.STRING,
      title: Sequelize.STRING,
      subtitle: Sequelize.STRING,
      thumbnailSrc: Sequelize.STRING,
      resourceCategory: Sequelize.STRING,
      tagPrimary: {
        type: Sequelize.ARRAY(Sequelize.STRING),
      },
      tagSecondary: {
        type: Sequelize.ARRAY(Sequelize.STRING),
      },
      resourceDetails: Sequelize.JSONB,
      emailTemplate: Sequelize.JSONB,
      resourceSlug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      authorDetails: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      seo: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      additionalDetails: Sequelize.JSONB,

      isPublished: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
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
    await queryInterface.dropTable('Resources');
  },
};