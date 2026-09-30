"use strict";

const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const UserLessonProgress = sequelize.define(
    "UserLessonProgress",
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      lesson_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "user_lesson_progress",
      timestamps: true,
      underscored: false,
    }
  );

  // Associations
  UserLessonProgress.associate = (models) => {
    UserLessonProgress.belongsTo(models.CourseModuleLesson, {
      foreignKey: "lesson_id",
      as: "lesson",
    });
  };

  return UserLessonProgress;
};
