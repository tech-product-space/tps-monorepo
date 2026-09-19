"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const SupportTicket = sequelize.define(
    "SupportTicket",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      ticket_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      requester_name: DataTypes.STRING,
      requester_email: DataTypes.STRING,
      requester_phone: DataTypes.STRING,
      subject: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      category: DataTypes.STRING,
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "open",
      },
      priority: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "normal",
      },
      is_cohort_member: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cohort_member_id: DataTypes.STRING,
      last_message_at: DataTypes.DATE,
      first_response_at: DataTypes.DATE,
      closed_at: DataTypes.DATE,
      last_user_seen_at: DataTypes.DATE,
      last_user_notified_at: DataTypes.DATE,
      metadata: DataTypes.JSONB,
    },
    {
      tableName: "support_tickets",
      paranoid: true,
      timestamps: true,
    }
  );

  SupportTicket.associate = function (models) {
    SupportTicket.belongsTo(models.users, {
      foreignKey: "user_id",
      as: "requester",
    });
    SupportTicket.belongsTo(models.CohortMember, {
      foreignKey: "cohort_member_id",
      as: "cohortMember",
    });
    SupportTicket.hasMany(models.SupportTicketMessage, {
      foreignKey: "ticket_id",
      as: "messages",
    });
    SupportTicket.hasMany(models.SupportTicketAttachment, {
      foreignKey: "ticket_id",
      as: "attachments",
    });
  };

  return SupportTicket;
};
