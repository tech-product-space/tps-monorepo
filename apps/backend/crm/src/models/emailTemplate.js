"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class EmailTemplate extends Model {
    static associate(models) {
      EmailTemplate.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "Creator",
      });

      EmailTemplate.hasMany(models.EmailLog, {
        foreignKey: "template_id",
        as: "EmailLogs",
      });
    }
  }

  EmailTemplate.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      // Course this template targets (catalog program_name). NULL = legacy row
      // from before onboarding emails became per-course. Uniqueness is enforced
      // on (type, course_id) via a DB constraint.
      course_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      subject: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      html_body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "EmailTemplate",
      tableName: "email_templates",
      underscored: true,
    }
  );

  return EmailTemplate;
};