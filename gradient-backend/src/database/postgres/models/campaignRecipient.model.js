import { ulid } from "ulid";
import { CAMPAIGN_RECIPIENT_STATUS } from "../../../config/constants/campaign.js";

/**
 * One person, one campaign — the snapshot of who was actually mailed and what
 * happened to them.
 *
 * Written once when the send job materialises the audience, then updated per
 * send. This is what makes "who got this" and "why did 600 people not get it"
 * answerable months later, and from phase 3 it is also the analytics table.
 */
export default (sequelize, DataTypes) => {
  const CampaignRecipient = sequelize.define(
    "CampaignRecipient",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      campaignId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      sourceType: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      sourceId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: CAMPAIGN_RECIPIENT_STATUS.PENDING,
        validate: {
          isIn: [Object.values(CAMPAIGN_RECIPIENT_STATUS)],
        },
      },

      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /** SES's message id. The join key for every delivery event — see plan §9.1. */
      providerMessageId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "campaign_recipients",
      timestamps: true,
    },
  );

  CampaignRecipient.associate = (models) => {
    CampaignRecipient.belongsTo(models.Campaign, {
      foreignKey: "campaignId",
      as: "campaign",
    });
  };

  return CampaignRecipient;
};
