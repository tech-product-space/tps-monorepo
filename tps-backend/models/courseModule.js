"use strict";

const { ulid } = require("ulid");
const { COURSE_MODULE_STATUS } = require("../constants/course");

module.exports = (sequelize, DataTypes) => {
  const CourseModule = sequelize.define(
    "CourseModule",
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      course_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      subtitle: {
        type: DataTypes.STRING,
      },

      slug: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: COURSE_MODULE_STATUS.DRAFT,
        validate: {
          isIn: [Object.values(COURSE_MODULE_STATUS)],
        },
      },

      overview: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "course_modules",
      timestamps: true,
    },
  );

  // Associations
  CourseModule.associate = (models) => {
    CourseModule.belongsTo(models.Course, {
      foreignKey: "course_id",
      as: "course",
    });

    CourseModule.hasMany(models.CourseModuleLesson, {
      foreignKey: "module_id",
      as: "lessons",
    });
  };

  return CourseModule;
};
