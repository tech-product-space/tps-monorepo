"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("course_modules", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      course_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "courses",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      subtitle: { type: Sequelize.STRING },

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      
      overview: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      status: {
        type: Sequelize.STRING,
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

    // Helpful indexes
    await queryInterface.addIndex("course_modules", ["course_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("course_modules");
  },
};
