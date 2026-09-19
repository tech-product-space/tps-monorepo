"use strict";

/**
 * Facebook Pages the lead poll reads from.
 *
 * One row per Page. The page token is AES-256-GCM encrypted at rest
 * (`util/tokenCrypto.js`) because it can read every lead the Page has ever
 * collected — it is a credential, not a config value.
 *
 * See `../FACEBOOK_LEADS_PLAN.md` §4.1.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_accounts", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      /** Numeric Facebook Page ID. */
      pageId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      /** `"<iv>:<tag>:<ciphertext>"`. Never leaves the server. */
      pageTokenEnc: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      /**
       * Routing for any form on this page with no mapping of its own.
       * `courseId` is FK-shaped but carries no constraint on purpose — a
       * deleted course must degrade ingestion, not stop it.
       */
      defaultSourceId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "meta_sources", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      defaultSubSourceId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "meta_sources", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      defaultCourseId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      /** `unknown` | `valid` | `invalid` — set by validate, sync and poll. */
      tokenStatus: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "unknown",
      },

      tokenCheckedAt: { type: Sequelize.DATE, allowNull: true },
      lastSyncedAt: { type: Sequelize.DATE, allowNull: true },
      lastPolledAt: { type: Sequelize.DATE, allowNull: true },

      lastError: { type: Sequelize.TEXT, allowNull: true },

      /** Debounces the token-expiry alert so a broken token mails once. */
      alertedAt: { type: Sequelize.DATE, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // One row per Page. Two accounts pointing at the same page would poll it
    // twice and double-count every lead.
    await queryInterface.addIndex("meta_accounts", ["pageId"], {
      name: "uq_meta_accounts_page_id",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_accounts");
  },
};
