"use strict";

const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const CourseTag = sequelize.define(
    "CourseTag",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      tableName: "course_tags",
      timestamps: true,
    },
  );

  CourseTag.associate = (models) => {
    CourseTag.belongsToMany(models.Course, {
      through: "course_course_tags",
      foreignKey: "course_tag_id",
      otherKey: "course_id",
      as: "courses",
    });
  };

  return CourseTag;
};
