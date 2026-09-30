"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("email_dispatch_logs", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      messageId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      provider: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "aws",
      },

      source: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "TRANSACTIONAL",
      },

      correlationId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      recipient: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      sender: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      fromName: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      subject: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      bodyHtml: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      bodyText: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "SENT",
      },

      estimatedCost: {
        type: Sequelize.DECIMAL(10, 5),
        allowNull: false,
        defaultValue: 0.0001,
      },

      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      hasAttachments: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      attachments: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      sentAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("email_dispatch_logs", ["createdAt"], {
      name: "email_dispatch_logs_created_at_idx",
    });

    await queryInterface.addIndex("email_dispatch_logs", ["sentAt"], {
      name: "email_dispatch_logs_sent_at_idx",
    });

    await queryInterface.addIndex("email_dispatch_logs", ["source", "createdAt"], {
      name: "email_dispatch_logs_source_created_idx",
    });

    await queryInterface.addIndex("email_dispatch_logs", ["status", "createdAt"], {
      name: "email_dispatch_logs_status_created_idx",
    });

    await queryInterface.addIndex("email_dispatch_logs", ["recipient"], {
      name: "email_dispatch_logs_recipient_idx",
    });

    await queryInterface.addIndex("email_dispatch_logs", ["sender"], {
      name: "email_dispatch_logs_sender_idx",
    });

    await queryInterface.addIndex("email_dispatch_logs", ["messageId"], {
      name: "email_dispatch_logs_message_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("email_dispatch_logs");
  },
};
