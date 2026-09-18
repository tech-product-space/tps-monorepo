"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_lead_forms", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      page_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "meta_pages",
          key: "id",
        },
        onDelete: "CASCADE",
      },

      form_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      form_name: {
        type: Sequelize.STRING,
      },

      status: Sequelize.STRING,
      
      metadata: {
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
    await queryInterface.dropTable("meta_lead_forms");
  },
};