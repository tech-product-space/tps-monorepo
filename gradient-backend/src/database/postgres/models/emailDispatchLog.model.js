import { ulid } from "ulid";

/**
 * Append-only audit log of AWS SES email dispatches.
 *
 * Captures real-time dispatch audit logs, delivery telemetry, and cost attribution
 * across all backend features ($0.10 / 1k emails).
 */
export default (sequelize, DataTypes) => {
  const EmailDispatchLog = sequelize.define(
    "EmailDispatchLog",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      /** AWS SES MessageId (e.g. 0100018...-000000), null if send failed */
      messageId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Provider used, e.g. "aws" */
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "aws",
      },

      /**
       * Feature or trigger source:
       * CAMPAIGN, SUPPORT_TICKET, AUTH_PASSWORD_RESET, ADMIN_INVITE,
       * ADMIN_PASSWORD_RESET, ADMIN_TEMP_PASSWORD, EVENT_GUEST,
       * EVENT_REMINDER, CERTIFICATE, COURSE_TRANSACTIONAL,
       * PROJECT_DOWNLOAD, RESOURCE_LEAD, WORKFLOW, SYSTEM_ALERT, TEST_SEND, etc.
       */
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "TRANSACTIONAL",
      },

      /** Correlation reference / ticket / campaign / user ID (e.g. "Ticket #TPS-1179", "Campaign #123") */
      correlationId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Primary recipient email address */
      recipient: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Sender email address */
      sender: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Sender display name (e.g. "The Gradient") */
      fromName: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Email subject line */
      subject: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /** Full rendered HTML email body */
      bodyHtml: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /** Plain text fallback content */
      bodyText: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /** Dispatch delivery status: SENT, FAILED, BOUNCED, COMPLAINT */
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "SENT",
      },

      /** Estimated AWS SES cost in USD ($0.10 / 1k = $0.00010 / email) */
      estimatedCost: {
        type: DataTypes.DECIMAL(10, 5),
        allowNull: false,
        defaultValue: 0.0001,
      },

      /** Error message if dispatch failed */
      error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      hasAttachments: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      /** Sanitized attachment metadata: [{ filename, contentType, size }] */
      attachments: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      /** Additional telemetry and contextual metadata */
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      sentAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "email_dispatch_logs",
      timestamps: true,
      updatedAt: false, // Append-only audit log
    },
  );

  return EmailDispatchLog;
};
