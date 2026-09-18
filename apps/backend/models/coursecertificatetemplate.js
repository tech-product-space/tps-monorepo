"use strict";

const { Model } = require("sequelize");
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  class CourseCertificateTemplate extends Model {
    static associate(models) {
      CourseCertificateTemplate.belongsTo(models.Course, {
        foreignKey: "courseId",
        as: "course",
      });
    }
  }

  CourseCertificateTemplate.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      courseId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      certificateName: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      imageSize: {
        type: DataTypes.JSONB,
        allowNull: false,
      },

      fields: {
        type: DataTypes.JSONB,
        allowNull: false,
      },

      templateImage: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      emailSubject: {
        type: DataTypes.STRING,
      },

      emailBody: {
        type: DataTypes.TEXT,
      },
    },
    {
      sequelize,
      modelName: "CourseCertificateTemplate",
      tableName: "course_certificate_templates",
      timestamps: true,
    },
  );

  return CourseCertificateTemplate;
};
