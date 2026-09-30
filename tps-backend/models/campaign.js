"use strict";
const { ulid } = require("ulid");
const { CAMPAIGN_STATUS } = require("../constants/campaign");

module.exports = (sequelize, DataTypes) => {
  const Campaign = sequelize.define(
    "Campaign",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      type: {
        type: DataTypes.STRING,
        defaultValue: "email",
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: CAMPAIGN_STATUS.DRAFT,
      },

      sender_name: DataTypes.STRING,

      sender_email: DataTypes.STRING,

      subject: DataTypes.TEXT,

      content: DataTypes.TEXT,

      recipient_filters: {
        type: DataTypes.JSONB,
      },

      scheduled_at: DataTypes.DATE,

      sent_at: DataTypes.DATE,
    },
    {
      tableName: "campaigns",
    },
  );

  return Campaign;
};
