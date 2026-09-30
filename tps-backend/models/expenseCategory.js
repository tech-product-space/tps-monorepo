"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const ExpenseCategory = sequelize.define(
    "ExpenseCategory",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // Reserved for a future income/expense split; defaults to "expense".
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "expense",
      },
      // Archive (is_active=false) instead of hard-deleting so historical
      // expenses keep a readable category name.
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "expense_categories",
      paranoid: true,
      timestamps: true,
    }
  );

  ExpenseCategory.associate = function (models) {
    ExpenseCategory.hasMany(models.ExpenseSubcategory, {
      foreignKey: "category_id",
      as: "subcategories",
    });
    ExpenseCategory.hasMany(models.Expense, {
      foreignKey: "category_id",
      as: "expenses",
    });
  };

  return ExpenseCategory;
};
