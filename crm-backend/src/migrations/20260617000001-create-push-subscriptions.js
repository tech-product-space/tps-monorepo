"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("push_subscriptions", {
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
      endpoint: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      p256dh: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      auth: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("push_subscriptions", ["user_id"], {
      name: "idx_push_subscriptions_user",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("push_subscriptions");
  },
};
