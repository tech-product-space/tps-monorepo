"use strict";

const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const CourseFAQ = sequelize.define(
    "CourseFAQ",
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        defaultValue: () => ulid()
      },

      course_id: {
        type: DataTypes.STRING,
        allowNull: false
      },

      question: {
        type: DataTypes.STRING,
        allowNull: false
      },

      answer: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: "course_faqs",
      timestamps: true
    }
  );

  // Associations
  CourseFAQ.associate = (models) => {
    CourseFAQ.belongsTo(models.Course, {
      foreignKey: "course_id",
      as: "course"
    });
  };

  return CourseFAQ;
};
