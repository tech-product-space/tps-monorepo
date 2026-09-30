"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Cohort extends Model {
    static associate(models) {
      Cohort.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "Creator",
      });

      Cohort.hasMany(models.LeadCourse, {
        foreignKey: "cohort_id",
        as: "Enrollments",
      });
    }
  }

  Cohort.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      // Program this cohort belongs to (matches lead_courses.course_id).
      // Null = a general cohort applicable to any program.
      course_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },

      start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },

      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Cohort",
      tableName: "cohorts",
      underscored: true,
    },
  );

  return Cohort;
};
