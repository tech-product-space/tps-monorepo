"use strict";
const { ulid } = require("ulid");
const { EXPENSE_STATUS, EXPENSE_SOURCE } = require("../constants/expenses");

module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define(
    "Expense",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "INR",
      },
      // Date the money was actually spent (distinct from createdAt).
      expense_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      category_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      subcategory_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EXPENSE_STATUS.PAID,
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Managed account the money moved through ("HDFC Current A/C"), from the
      // admin-curated expense_payment_accounts list.
      payment_account_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      vendor: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      receipt_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Set when this row was auto-generated from a recurring template.
      recurring_expense_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // company.id of the staff member who logged it (null for cron-generated
      // and external form submissions).
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Where this row came from: internal (admin) or external (public form).
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EXPENSE_SOURCE.INTERNAL,
      },
      // Set when the row was created through a public submission form.
      expense_form_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Owning team — copied from the form on external rows, optional internally.
      team_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Identity captured from the external submitter (null for internal rows).
      submitter_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      submitter_email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      submitter_phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "expenses",
      paranoid: true,
      timestamps: true,
    }
  );

  Expense.associate = function (models) {
    Expense.belongsTo(models.ExpenseCategory, {
      foreignKey: "category_id",
      as: "category",
    });
    Expense.belongsTo(models.ExpenseSubcategory, {
      foreignKey: "subcategory_id",
      as: "subcategory",
    });
    Expense.belongsTo(models.RecurringExpense, {
      foreignKey: "recurring_expense_id",
      as: "recurringExpense",
    });
    Expense.belongsTo(models.company, {
      foreignKey: "created_by",
      as: "creator",
    });
    Expense.belongsTo(models.ExpenseTeam, {
      foreignKey: "team_id",
      as: "team",
    });
    Expense.belongsTo(models.ExpensePaymentAccount, {
      foreignKey: "payment_account_id",
      as: "paymentAccount",
    });
    Expense.belongsTo(models.ExpenseForm, {
      foreignKey: "expense_form_id",
      as: "form",
    });
  };

  return Expense;
};
