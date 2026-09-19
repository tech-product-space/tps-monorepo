import { ulid } from "ulid";
import {
  CAMPAIGN_STATUS,
  EMPTY_RECIPIENT_FILTERS,
} from "../../../config/constants/campaign.js";

/**
 * A bulk marketing email: who it goes to, what it says, and when.
 *
 * `recipientFilters` is a saved query rather than a frozen recipient list — see
 * the column comment. Status and every counter are owned by the send job;
 * controllers write only CAMPAIGN_EDITABLE_FIELDS.
 */
export default (sequelize, DataTypes) => {
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

      subject: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      senderEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isEmail: true },
      },

      senderName: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "Gradient Learnings",
      },

      /**
       * `{ include: [{ type, filters }], exclude: [...] }`.
       *
       * Both sides run through the same resolvers; exclude is subtracted from
       * include by email. Union-only would make the most ordinary segment there
       * is — "downloaded the brochure but has not enrolled" — inexpressible.
       */
      recipientFilters: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: EMPTY_RECIPIENT_FILTERS,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: CAMPAIGN_STATUS.DRAFT,
        validate: {
          isIn: [Object.values(CAMPAIGN_STATUS)],
        },
      },

      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      totalRecipients: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      totalSent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      totalFailed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      createdBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      updatedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "campaigns",
      timestamps: true,
    },
  );

  Campaign.associate = (models) => {
    Campaign.hasMany(models.CampaignRecipient, {
      foreignKey: "campaignId",
      as: "recipients",
    });

    Campaign.belongsTo(models.AdminUser, {
      foreignKey: "createdBy",
      as: "createdAdmin",
    });

    Campaign.belongsTo(models.AdminUser, {
      foreignKey: "updatedBy",
      as: "updatedAdmin",
    });
  };

  return Campaign;
};
