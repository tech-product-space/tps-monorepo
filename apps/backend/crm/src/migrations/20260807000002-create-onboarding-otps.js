"use strict";

/**
 * Live WhatsApp OTP challenges for the onboarding portal.
 *
 * Ported from tps-next-backend's Mongo `otps` collection. Mongo expired these
 * with a TTL index on expiresAt; Postgres has no equivalent, so
 * cron/onboarding/cron.js sweeps them instead — hence the index on expires_at.
 *
 * Rows are deleted on successful verification, so this table stays small: it
 * holds only challenges that are in flight or recently abandoned.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("onboarding_otps", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      lead_profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "lead_profiles", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: "Digits only, as dialled — country code included",
      },
      country_code: { type: Sequelize.STRING(10), allowNull: false },
      // bcrypt. The code itself is never stored and never logged outside
      // OTP_MODE != 'live'.
      otp_hash: { type: Sequelize.STRING(100), allowNull: false },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      resend_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      last_sent_at: { type: Sequelize.DATE, allowNull: false },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Drives the per-phone rate limit (count live challenges for a profile).
    await queryInterface.addIndex("onboarding_otps", ["lead_profile_id"], {
      name: "idx_onboarding_otps_lead_profile",
    });

    // Drives the cleanup sweep.
    await queryInterface.addIndex("onboarding_otps", ["expires_at"], {
      name: "idx_onboarding_otps_expires_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("onboarding_otps");
  },
};
