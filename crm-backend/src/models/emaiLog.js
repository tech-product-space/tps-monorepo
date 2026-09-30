"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class EmailLog extends Model {
    static associate(models) {
      EmailLog.belongsTo(models.EmailTemplate, {
        foreignKey: "template_id",
        as: "EmailTemplate",
      });

      EmailLog.belongsTo(models.LeadCourse, {
        foreignKey: "lead_course_id",
        as: "LeadCourse",
      });
    }
  }

  EmailLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lead_course_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      template_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      recipient_email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      subject: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("sent", "failed", "preview"),
        allowNull: false,
        defaultValue: "sent",
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "EmailLog",
      tableName: "email_logs",
      underscored: true,
    }
  );

  return EmailLog;
};