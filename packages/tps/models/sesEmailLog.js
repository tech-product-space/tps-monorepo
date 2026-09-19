"use strict";

const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const SesEmailLog = sequelize.define(
    "SesEmailLog",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      message_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "AWS SES Message ID from SES SendEmail response",
      },

      correlation_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Internal correlation token attached via SES Tags (ps_msg_id)",
      },

      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "OTHER",
        comment: "Caller source: WORKFLOW, CAMPAIGN, NEWSLETTER, SUPPORT_TICKET, OTHER",
      },

      source_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "ID of the entity (campaignId, workflowEnrollmentId, ticketId)",
      },

      source_name: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Human-readable label of the caller source",
      },

      sender_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      sender_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      recipient_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      subject: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "SENT",
        comment: "SENT, FAILED, BOUNCED, COMPLAINT",
      },

      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      estimated_cost_usd: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.0001,
        comment: "Estimated AWS SES cost ($0.10 per 1,000 emails = $0.0001/email)",
      },

      payload_size_bytes: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: "ses_email_logs",
      timestamps: true,
      indexes: [
        { fields: ["source", "createdAt"] },
        { fields: ["sender_email", "createdAt"] },
        { fields: ["status", "createdAt"] },
        { fields: ["correlation_id"] },
        { fields: ["message_id"] },
        { fields: ["recipient_email"] },
      ],
    }
  );

  return SesEmailLog;
};
