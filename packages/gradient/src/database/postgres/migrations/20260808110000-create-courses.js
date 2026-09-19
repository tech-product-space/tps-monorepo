"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Courses", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      pricing: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      brochure: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Courses");
  },
};
