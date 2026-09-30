"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("whatsapp_templates", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment:
          "Message body. Supports {{name}}, {{sender_name}}, {{product}}, {{email}} tokens",
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Default templates (Superadmin-created) are visible to all users",
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
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

    await queryInterface.addIndex("whatsapp_templates", ["created_by"], {
      name: "idx_whatsapp_templates_created_by",
    });
    await queryInterface.addIndex("whatsapp_templates", ["is_default"], {
      name: "idx_whatsapp_templates_is_default",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("whatsapp_templates");
  },
};
