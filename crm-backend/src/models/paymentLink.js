"use strict";
const { Model } = require("sequelize");

/**
 * Polymorphic payment link — one row per hosted payment link, for any gateway.
 * Replaces the per-gateway razorpay_payment_links / cashfree_payment_links
 * tables; the `provider` column says which gateway each row belongs to.
 */
module.exports = (sequelize, DataTypes) => {
  class PaymentLink extends Model {
    static associate(models) {
      PaymentLink.belongsTo(models.Payment, {
        foreignKey: "payment_id",
        as: "Payment",
      });
    }
  }

  PaymentLink.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      payment_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      // Gateway key: 'razorpay' | 'cashfree' | …
      provider: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },

      // Gateway link id used to cancel the link.
      provider_link_id: {
        type: DataTypes.STRING,
      },

      // Hosted payment link URL (Razorpay short_url / Cashfree link_url).
      url: {
        type: DataTypes.STRING,
      },

      // Normalized lowercase link status.
      status: {
        type: DataTypes.STRING(20),
      },

      expire_by: {
        type: DataTypes.DATE,
      },

      // Gateway transaction/order id captured on success.
      provider_ref: {
        type: DataTypes.STRING,
      },

      // Full gateway payload (audit / legacy ids).
      raw: {
        type: DataTypes.JSONB,
      },
    },
    {
      sequelize,
      modelName: "PaymentLink",
      tableName: "payment_links",
      underscored: true,
    },
  );

  return PaymentLink;
};
