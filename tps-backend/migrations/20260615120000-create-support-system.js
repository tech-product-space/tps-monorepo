"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Concurrency-safe human ticket numbers: TPS-1000, TPS-1001, ...
    await queryInterface.sequelize.query(
      "CREATE SEQUENCE IF NOT EXISTS support_tickets_seq START 1000;"
    );

    await queryInterface.createTable("support_tickets", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      ticket_number: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      requester_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      requester_email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      requester_phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      subject: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "open",
      },
      priority: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "normal",
      },
      is_cohort_member: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cohort_member_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      last_message_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      first_response_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      closed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_user_seen_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_user_notified_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      deletedAt: {
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

    await queryInterface.addIndex("support_tickets", ["user_id"]);
    await queryInterface.addIndex("support_tickets", ["status"]);
    await queryInterface.addIndex("support_tickets", ["priority"]);
    await queryInterface.addIndex("support_tickets", ["last_message_at"]);

    await queryInterface.createTable("support_ticket_messages", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      ticket_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "support_tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      sender_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      sender_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      sender_staff_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "company", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "message",
      },
      is_internal: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex("support_ticket_messages", ["ticket_id"]);
    await queryInterface.addIndex("support_ticket_messages", ["createdAt"]);

    await queryInterface.createTable("support_ticket_attachments", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      ticket_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "support_tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      message_id: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "support_ticket_messages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      file_url: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      file_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      file_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      file_size: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      uploaded_by_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      uploaded_by_id: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex("support_ticket_attachments", ["ticket_id"]);
    await queryInterface.addIndex("support_ticket_attachments", ["message_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("support_ticket_attachments");
    await queryInterface.dropTable("support_ticket_messages");
    await queryInterface.dropTable("support_tickets");
    await queryInterface.sequelize.query(
      "DROP SEQUENCE IF EXISTS support_tickets_seq;"
    );
  },
};
