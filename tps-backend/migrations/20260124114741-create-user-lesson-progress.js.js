"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_lesson_progress", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users", 
          key: "id",
        },
        onDelete: "CASCADE",
      },

      lesson_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "course_module_lessons",
          key: "id",
        },
        onDelete: "CASCADE",
      },

      completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    // Indexes for performance
    await queryInterface.addIndex("user_lesson_progress", ["user_id"]);
    await queryInterface.addIndex("user_lesson_progress", ["lesson_id"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("user_lesson_progress");
  },
};
