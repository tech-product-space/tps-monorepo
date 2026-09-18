"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const ExpenseSubcategory = sequelize.define(
    "ExpenseSubcategory",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      category_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "expense_subcategories",
      paranoid: true,
      timestamps: true,
    }
  );

  ExpenseSubcategory.associate = function (models) {
    ExpenseSubcategory.belongsTo(models.ExpenseCategory, {
      foreignKey: "category_id",
      as: "category",
    });
    ExpenseSubcategory.hasMany(models.Expense, {
      foreignKey: "subcategory_id",
      as: "expenses",
    });
  };

  return ExpenseSubcategory;
};
