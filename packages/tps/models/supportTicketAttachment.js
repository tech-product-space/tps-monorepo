"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const SupportTicketAttachment = sequelize.define(
    "SupportTicketAttachment",
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
      // null = belongs to the ticket's original query; otherwise the message it rode in on.
      message_id: DataTypes.STRING,
      file_url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      file_name: DataTypes.STRING,
      file_type: DataTypes.STRING,
      file_size: DataTypes.INTEGER,
      uploaded_by_type: DataTypes.STRING,
      uploaded_by_id: DataTypes.INTEGER,
    },
    {
      tableName: "support_ticket_attachments",
      timestamps: true,
    }
  );

  SupportTicketAttachment.associate = function (models) {
    SupportTicketAttachment.belongsTo(models.SupportTicket, {
      foreignKey: "ticket_id",
      as: "ticket",
    });
    SupportTicketAttachment.belongsTo(models.SupportTicketMessage, {
      foreignKey: "message_id",
      as: "message",
    });
  };

  return SupportTicketAttachment;
};
