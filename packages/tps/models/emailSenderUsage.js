"use strict";

const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const EmailSenderUsage = sequelize.define(
    "EmailSenderUsage",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      sender_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      sent_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      tableName: "email_sender_usage",
    },
  );

  return EmailSenderUsage;
};
