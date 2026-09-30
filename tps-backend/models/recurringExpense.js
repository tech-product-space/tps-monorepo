"use strict";
const { ulid } = require("ulid");
const { RECURRING_FREQUENCY } = require("../constants/expenses");

module.exports = (sequelize, DataTypes) => {
  const RecurringExpense = sequelize.define(
    "RecurringExpense",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      // --- template fields mirrored onto each generated expense ---
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
      category_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      subcategory_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: true,
      },
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
      // --- schedule ---
      frequency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: RECURRING_FREQUENCY.MONTHLY,
      },
      // 1-28 so it exists in every month.
      day_of_month: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // Last date an expense was generated — guards against double-runs.
      last_run_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "recurring_expenses",
      paranoid: true,
      timestamps: true,
    }
  );

  RecurringExpense.associate = function (models) {
    RecurringExpense.belongsTo(models.ExpenseCategory, {
      foreignKey: "category_id",
      as: "category",
    });
    RecurringExpense.belongsTo(models.ExpenseSubcategory, {
      foreignKey: "subcategory_id",
      as: "subcategory",
    });
    RecurringExpense.belongsTo(models.ExpensePaymentAccount, {
      foreignKey: "payment_account_id",
      as: "paymentAccount",
    });
    RecurringExpense.hasMany(models.Expense, {
      foreignKey: "recurring_expense_id",
      as: "generatedExpenses",
    });
  };

  return RecurringExpense;
};
