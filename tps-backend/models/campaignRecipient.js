"use strict";

const { ulid } = require("ulid");
const { CAMPAIGN_RECIPIENT_STATUS } = require("../constants/campaign");

module.exports = (sequelize, DataTypes) => {
  const CampaignRecipient = sequelize.define(
    "CampaignRecipient",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      campaign_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: DataTypes.STRING,
      phone: DataTypes.STRING,

      source_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      source_id: DataTypes.STRING,

      status: {
        type: DataTypes.STRING,
        defaultValue: CAMPAIGN_RECIPIENT_STATUS.PENDING,
      },

      sent_at: DataTypes.DATE,

      error: DataTypes.TEXT,
    },
    {
      tableName: "campaign_recipients",
    },
  );

  CampaignRecipient.associate = (models) => {
    CampaignRecipient.belongsTo(models.Campaign, {
      foreignKey: "campaign_id",
      as: "campaign",
    });
  };

  return CampaignRecipient;
};
