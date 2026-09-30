"use strict";

const { ulid } = require("ulid");
const { COURSE_STATUS, COURSE_TYPE } = require("../constants/course");

module.exports = (sequelize, DataTypes) => {
  const Course = sequelize.define(
    "Course",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      subtitle: {
        type: DataTypes.STRING,
      },

      description: {
        type: DataTypes.STRING,
      },

      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      price: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },

      is_video_course: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },

      thumbnail: {
        type: DataTypes.STRING,
      },

      thumbnail_video: {
        type: DataTypes.STRING,
      },

      duration: {
        type: DataTypes.STRING,
      },

      type: {
        type: DataTypes.STRING,
        defaultValue: COURSE_TYPE.ONLINE,
        validate: {
          isIn: [Object.values(COURSE_TYPE)],
        },
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: COURSE_STATUS.DRAFT,
        validate: {
          isIn: [Object.values(COURSE_STATUS)],
        },
      },

      content: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      seo_meta: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
    },
    {
      tableName: "courses",
      timestamps: true,
    },
  );

  Course.associate = (models) => {
    Course.hasMany(models.CourseModule, {
      foreignKey: "course_id",
      as: "modules",
    });

    Course.hasMany(models.CourseEnrollment, {
      foreignKey: "course_id",
      as: "courseEnrollments",
    });

    Course.belongsToMany(models.CourseTag, {
      through: "course_course_tags",
      foreignKey: "course_id",
      otherKey: "course_tag_id",
      as: "tags",
    });
  };

  return Course;
};
