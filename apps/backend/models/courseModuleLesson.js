"use strict";

const { ulid } = require("ulid");
const {
  COURSE_LESSON_STATUS,
  LESSON_CONTENT_VERSION,
} = require("../constants/course");

module.exports = (sequelize, DataTypes) => {
  const CourseModuleLesson = sequelize.define(
    "CourseModuleLesson",
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      module_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },

      slug: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      content: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      // Which editor wrote `content`. 1 = block builder ({ blocks: [] }),
      // 2 = Tiptap ({ doc: {...} }). The public player and the admin editor both
      // branch on this, so the two formats coexist on the same course.
      content_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: LESSON_CONTENT_VERSION.BLOCKS,
        validate: {
          isIn: [Object.values(LESSON_CONTENT_VERSION)],
        },
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: COURSE_LESSON_STATUS.DRAFT,
        validate: {
          isIn: [Object.values(COURSE_LESSON_STATUS)],
        },
      },

      seo_meta: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
    },
    {
      tableName: "course_module_lessons",
      timestamps: true,
      underscored: false,
    },
  );

  // Associations
  CourseModuleLesson.associate = (models) => {
    CourseModuleLesson.belongsTo(models.CourseModule, {
      foreignKey: "module_id",
      as: "module",
    });
    
    CourseModuleLesson.hasMany(models.UserLessonProgress, {
      foreignKey: "lesson_id",
      as: "progress",
    });
  };
  return CourseModuleLesson;
};
