'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('blogs', {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subTitle: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: "",
      },

      authorDetails: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          name: "",
          designation: "",
          company: "",
          imgSrc: "",
          imgAlt: "",
        },
      },

      publishedDate: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      category: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      tableOfContents: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      content: {
        type: Sequelize.JSONB,
        allowNull: false,
      },

      tags: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      readTime: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      thumbnailSrc: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: "",
      },

      thumbnailAlt: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: "",
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "draft",
      },

      url: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      publishedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      faq: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
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

    // indexes (recommended)
    await queryInterface.addIndex('blogs', ['status']);
    await queryInterface.addIndex('blogs', ['category']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('blogs');
  },
};