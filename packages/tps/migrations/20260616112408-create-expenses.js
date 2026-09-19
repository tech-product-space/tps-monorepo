"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("expenses", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "INR",
      },
      expense_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      category_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "expense_categories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      subcategory_id: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "expense_subcategories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "paid",
      },
      payment_method: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      vendor: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      receipt_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      recurring_expense_id: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "recurring_expenses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "company", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("expenses", ["expense_date"]);
    await queryInterface.addIndex("expenses", ["category_id"]);
    await queryInterface.addIndex("expenses", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("expenses");
  },
};
