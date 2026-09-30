"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const SupportTicketMessage = sequelize.define(
    "SupportTicketMessage",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      ticket_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      sender_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      sender_user_id: DataTypes.INTEGER,
      sender_staff_id: DataTypes.INTEGER,
      body: DataTypes.TEXT,
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "message",
      },
      is_internal: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata: DataTypes.JSONB,
    },
    {
      tableName: "support_ticket_messages",
      timestamps: true,
    }
  );

  SupportTicketMessage.associate = function (models) {
    SupportTicketMessage.belongsTo(models.SupportTicket, {
      foreignKey: "ticket_id",
      as: "ticket",
    });
    SupportTicketMessage.belongsTo(models.users, {
      foreignKey: "sender_user_id",
      as: "userAuthor",
    });
    SupportTicketMessage.belongsTo(models.company, {
      foreignKey: "sender_staff_id",
      as: "staffAuthor",
    });
    SupportTicketMessage.hasMany(models.SupportTicketAttachment, {
      foreignKey: "message_id",
      as: "attachments",
    });
  };

  return SupportTicketMessage;
};
