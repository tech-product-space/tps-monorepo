"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_lead_form_mappings", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      meta_form_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "meta_lead_forms",
          key: "id",
        },
        onDelete: "CASCADE",
      },

      lead_type_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "external_lead_types",
          key: "id",
        },
        onDelete: "CASCADE",
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
    await queryInterface.dropTable("meta_lead_form_mappings");
  },
};
