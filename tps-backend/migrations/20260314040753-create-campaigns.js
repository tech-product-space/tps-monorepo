"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("campaigns", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "email",
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      sender_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      sender_email: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      subject: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      content: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      recipient_filters: {
        type: Sequelize.JSONB,
      },

      scheduled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("campaigns", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("campaigns");
  },
};
