"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const ExpenseTeam = sequelize.define(
    "ExpenseTeam",
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
      // Archive (is_active=false) instead of hard-deleting so historical
      // expenses/forms keep a readable team name.
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
      tableName: "expense_teams",
      paranoid: true,
      timestamps: true,
    }
  );

  ExpenseTeam.associate = function (models) {
    ExpenseTeam.hasMany(models.ExpenseForm, {
      foreignKey: "team_id",
      as: "forms",
    });
    ExpenseTeam.hasMany(models.Expense, {
      foreignKey: "team_id",
      as: "expenses",
    });
  };

  return ExpenseTeam;
};
