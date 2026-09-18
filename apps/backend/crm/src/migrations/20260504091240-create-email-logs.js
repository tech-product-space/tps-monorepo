"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("email_logs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lead_course_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "lead_courses", key: "id" },
        onDelete: "SET NULL",
        comment:
          "Which enrollment triggered this email (null for preview sends)",
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "email_templates", key: "id" },
        onDelete: "SET NULL", 
        onUpdate: "CASCADE",
      },
      recipient_email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      subject: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: "Rendered subject at send time (with vars substituted)",
      },
      status: {
        type: Sequelize.ENUM("sent", "failed", "preview"),
        allowNull: false,
        defaultValue: "sent",
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Populated when status=failed",
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("NOW()"),
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

    await queryInterface.addIndex("email_logs", ["lead_course_id"], {
      name: "idx_email_logs_lead_course_id",
    });
    await queryInterface.addIndex("email_logs", ["template_id"], {
      name: "idx_email_logs_template_id",
    });
    await queryInterface.addIndex("email_logs", ["status"], {
      name: "idx_email_logs_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("email_logs");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_email_logs_status";',
    );
  },
};
