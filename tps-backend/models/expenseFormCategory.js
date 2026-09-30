"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  // The per-form allow-list. One row = one category (optionally narrowed to a
  // single subcategory) that the public form lets a submitter choose. A row with
  // subcategory_id = null means "the whole category is allowed".
  const ExpenseFormCategory = sequelize.define(
    "ExpenseFormCategory",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      form_id: {
        type: DataTypes.STRING,
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
    },
    {
      tableName: "expense_form_categories",
      timestamps: true,
    }
  );

  ExpenseFormCategory.associate = function (models) {
    ExpenseFormCategory.belongsTo(models.ExpenseForm, {
      foreignKey: "form_id",
      as: "form",
    });
    ExpenseFormCategory.belongsTo(models.ExpenseCategory, {
      foreignKey: "category_id",
      as: "category",
    });
    ExpenseFormCategory.belongsTo(models.ExpenseSubcategory, {
      foreignKey: "subcategory_id",
      as: "subcategory",
    });
  };

  return ExpenseFormCategory;
};
