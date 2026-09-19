"use strict";

const psEnv = require("@ps/env/crm");
/**
 * Facebook/Meta accounts that the lead cron polls. Replaces the hardcoded
 * PAGE_ID + META_PAGE_TOKEN constants so multiple pages (e.g. TPS + Gradient)
 * can each map to their own product. Page tokens are AES-256-GCM encrypted at
 * rest (see utils/crypto.js), same as Google OAuth tokens.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_accounts", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      page_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      // AES-256-GCM encrypted long-lived page token.
      page_token_enc: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      // Product id used for a form that has no explicit mapping. Matches the
      // string PK on products (no FK — ingestion falls back gracefully).
      default_product_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // 'unknown' | 'valid' | 'invalid' — set by the validate-token check.
      token_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "unknown",
      },
      token_checked_at: { type: Sequelize.DATE, allowNull: true },
      last_synced_at: { type: Sequelize.DATE, allowNull: true },
      last_polled_at: { type: Sequelize.DATE, allowNull: true },
      last_error: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("meta_accounts", ["page_id"], {
      name: "uq_meta_accounts_page_id",
      unique: true,
    });

    // Best-effort seed from the existing env config so live ingestion keeps
    // working through the cutover. Skipped silently if the token or the
    // encryption key is missing (e.g. beta env) — the admin can add the
    // account from the UI instead.
    try {
      const token = psEnv.META_PAGE_TOKEN;
      const key = psEnv.TOKEN_ENCRYPTION_KEY;
      if (token && key && key.length === 64) {
        const { encrypt } = require("../utils/crypto");
        await queryInterface.bulkInsert("meta_accounts", [
          {
            // id omitted → DB default gen_random_uuid() fills it.
            name: "Product Space Meta",
            page_id: "361603210370170",
            page_token_enc: encrypt(token),
            default_product_id: "Facebook",
            enabled: true,
            token_status: "unknown",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);
      }
    } catch (err) {
      console.warn(
        "meta_accounts seed skipped:",
        err && err.message ? err.message : err,
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_accounts");
  },
};
