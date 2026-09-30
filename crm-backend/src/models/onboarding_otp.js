"use strict";
const { Model } = require("sequelize");

/**
 * A live WhatsApp OTP challenge for the onboarding portal.
 *
 * Deleted on successful verification, so a row's existence means "in flight or
 * abandoned". Expired rows are swept by cron/onboarding/cron.js — Postgres has
 * no TTL index, which is the one thing that differs from the Mongo original in
 * tps-next-backend.
 *
 * otp_hash is bcrypt. The code is never stored in the clear and never logged
 * unless OTP_MODE is not 'live'.
 */
module.exports = (sequelize, DataTypes) => {
  class OnboardingOtp extends Model {
    static associate(models) {
      OnboardingOtp.belongsTo(models.LeadProfile, {
        foreignKey: "lead_profile_id",
        as: "LeadProfile",
      });
    }

    isExpired() {
      return this.expires_at.getTime() < Date.now();
    }
  }

  OnboardingOtp.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lead_profile_id: { type: DataTypes.UUID, allowNull: false },
      // Digits only, country code included — exactly what goes to WhatsApp.
      phone: { type: DataTypes.STRING(20), allowNull: false },
      country_code: { type: DataTypes.STRING(10), allowNull: false },
      otp_hash: { type: DataTypes.STRING(100), allowNull: false },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      resend_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      last_sent_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "OnboardingOtp",
      tableName: "onboarding_otps",
      underscored: true,
    },
  );

  return OnboardingOtp;
};
