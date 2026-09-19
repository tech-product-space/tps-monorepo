"use strict";

/**
 * The ticks in the guide sidebar.
 *
 * Unique on (userId, projectStepId) — FreeCourseLessonProgress has no such
 * constraint and can hold two rows for the same lesson, which makes "how far
 * did they get" a DISTINCT query forever after.
 *
 * CASCADE on both sides: progress against a deleted step or a deleted account
 * is not a record of anything.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProjectStepProgress", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      userId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      projectStepId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "ProjectSteps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "ProjectStepProgress",
      ["userId", "projectStepId"],
      { unique: true, name: "project_step_progress_user_step_unique" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ProjectStepProgress");
  },
};
