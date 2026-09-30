"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("email_templates", {
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
      type: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true, 
      },
      subject: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      html_body: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment:
          "Full HTML body. Supports {{name}}, {{program_name}}, {{start_date}}, {{final_fee}}, {{email}} tokens",
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          "Only one template should be active at a time for auto-send on enrollment",
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

    await queryInterface.addIndex("email_templates", ["is_active"], {
      name: "idx_email_templates_is_active",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("email_templates");
  },
};
