"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_integrations", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      provider: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "google",
      },
      // Google account the user linked (shown in the UI).
      google_email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Tokens are AES-256-GCM encrypted at rest (see utils/crypto.js).
      access_token_enc: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      access_token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      refresh_token_enc: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      scope: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // 'connected' | 'revoked' | 'error'
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "connected",
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("user_integrations", ["user_id", "provider"], {
      name: "uq_user_integrations_user_provider",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user_integrations");
  },
};
