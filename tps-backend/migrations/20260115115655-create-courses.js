"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("courses", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      title: { type: Sequelize.STRING, allowNull: false },
      subtitle: { type: Sequelize.STRING },
      description: { type: Sequelize.STRING },

      slug: { type: Sequelize.STRING, allowNull: false, unique: true },

      price: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      is_free: { type: Sequelize.BOOLEAN, defaultValue: false },

      thumbnail: { type: Sequelize.STRING },

      type: { type: Sequelize.STRING },

      status: {
        type: Sequelize.STRING,
      },

      content: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      seo_meta: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("courses");
  },
};
