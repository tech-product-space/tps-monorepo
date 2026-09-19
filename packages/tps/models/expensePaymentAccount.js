"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const ExpensePaymentAccount = sequelize.define(
    "ExpensePaymentAccount",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      // The account money moved through: "HDFC Current A/C", "Petty Cash".
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // Archive (is_active=false) instead of hard-deleting so historical
      // expenses keep a readable account name.
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "expense_payment_accounts",
      paranoid: true,
      timestamps: true,
    }
  );

  ExpensePaymentAccount.associate = function (models) {
    ExpensePaymentAccount.hasMany(models.Expense, {
      foreignKey: "payment_account_id",
      as: "expenses",
    });
    ExpensePaymentAccount.hasMany(models.RecurringExpense, {
      foreignKey: "payment_account_id",
      as: "recurringExpenses",
    });
  };

  return ExpensePaymentAccount;
};
