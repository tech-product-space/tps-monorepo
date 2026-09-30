import { ulid } from "ulid";
import {
  SUBSCRIBER_STATUS,
  SUBSCRIBER_SOURCE,
} from "../../../config/constants/subscriber.js";

/**
 * Every email address we hold, and whether we may email it.
 *
 * This is wider than the name suggests. It started as the newsletter list and
 * is now also the **suppression list** for marketing campaigns, so a row can
 * exist for someone who never subscribed to anything — they clicked unsubscribe
 * in a campaign and this is the consent record. `source` tells them apart.
 *
 * One table on purpose: opt-out state in two places needs a sync step, and the
 * first thing a sync gets wrong is the case the feature exists to prevent.
 * Writes go through `services/subscriber/suppression.service.js`, never direct.
 */
export default (sequelize, DataTypes) => {
  const Subscriber = sequelize.define(
    "Subscriber",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: SUBSCRIBER_STATUS.ACTIVE,
        validate: {
          isIn: [Object.values(SUBSCRIBER_STATUS)],
        },
      },

      /**
       * Set together by the suppression service, cleared together on
       * re-activation. `updatedAt` cannot stand in for `unsubscribedAt` — any
       * later edit to the row would move it.
       */
      unsubscribedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      unsubscribeReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /** Which send prompted it. Deliberately not a foreign key: deleting a
       *  campaign must not delete the record of someone leaving because of it. */
      unsubscribedFromCampaignId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: SUBSCRIBER_SOURCE.FOOTER,
      },

      pageUrl: {
        type: DataTypes.STRING,
      },

      referrer: {
        type: DataTypes.STRING,
      },

      utmSource: {
        type: DataTypes.STRING,
      },

      utmMedium: {
        type: DataTypes.STRING,
      },

      utmCampaign: {
        type: DataTypes.STRING,
      },

      utmTerm: {
        type: DataTypes.STRING,
      },

      utmContent: {
        type: DataTypes.STRING,
      },
    },
    {
      tableName: "subscribers",
      timestamps: true,
    },
  );

  return Subscriber;
};
