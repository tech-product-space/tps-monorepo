"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("external_leads", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
      },

      email: {
        type: Sequelize.STRING,
      },

      phone: {
        type: Sequelize.STRING,
      },

      source: {
        type: Sequelize.STRING,
      },

      type_id: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "external_lead_types",
          key: "id",
        },
        onDelete: "SET NULL",
      },

      external_form_id: {
        type: Sequelize.STRING,
      },

      external_lead_id: {
        type: Sequelize.STRING,
        unique: true,
      },

      external_created_at: {
        type: Sequelize.DATE,
      },

      form_data: {
        type: Sequelize.JSONB,
      },

      additional_data: {
        type: Sequelize.JSONB,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("external_leads");
  },
};
