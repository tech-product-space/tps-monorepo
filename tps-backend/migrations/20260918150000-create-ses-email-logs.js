"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ses_email_logs", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      message_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      correlation_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      source: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "OTHER",
      },

      source_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      source_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      sender_email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      sender_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      recipient_email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subject: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "SENT",
      },

      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      estimated_cost_usd: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.0001,
      },

      payload_size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex("ses_email_logs", ["source", "createdAt"]);
    await queryInterface.addIndex("ses_email_logs", ["sender_email", "createdAt"]);
    await queryInterface.addIndex("ses_email_logs", ["status", "createdAt"]);
    await queryInterface.addIndex("ses_email_logs", ["correlation_id"]);
    await queryInterface.addIndex("ses_email_logs", ["message_id"]);
    await queryInterface.addIndex("ses_email_logs", ["recipient_email"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ses_email_logs");
  },
};
