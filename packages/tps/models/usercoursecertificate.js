"use strict";
const { Model } = require("sequelize");
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  class UserCourseCertificate extends Model {
    static associate(models) {
      // user
      UserCourseCertificate.belongsTo(models.users, {
        foreignKey: "user_id",
        as: "user",
      });

      // course
      UserCourseCertificate.belongsTo(models.Course, {
        foreignKey: "course_id",
        as: "course",
      });

      // certificate template
      UserCourseCertificate.belongsTo(models.CourseCertificateTemplate, {
        foreignKey: "certificate_template_id",
        as: "template",
      });
    }
  }

  UserCourseCertificate.init(
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        defaultValue: () => ulid(),
      },
      
      certificate_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      course_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      certificate_template_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "UserCourseCertificate",
      tableName: "user_course_certificates",
      timestamps: true,
    },
  );

  return UserCourseCertificate;
};
