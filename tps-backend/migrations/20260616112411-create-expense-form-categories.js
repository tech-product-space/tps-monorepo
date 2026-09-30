"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("expense_form_categories", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      form_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "expense_forms", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      category_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "expense_categories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      subcategory_id: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "expense_subcategories", key: "id" },
        onUpdate: "CASCADE",
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

    await queryInterface.addIndex("expense_form_categories", ["form_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("expense_form_categories");
  },
};
