"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const ExpenseForm = sequelize.define(
    "ExpenseForm",
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
      team_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // Public, unguessable identifier used in the shareable link.
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      // Free-text instructions rendered at the top of the public form.
      instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Disabling a form makes its public link return 404 without deleting data.
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      require_receipt: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_submitter_info: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      require_notes: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Per-field config for the public form: { <field>: { enabled, required } }.
      // Superseded the individual require_* flags above; normalized on read.
      field_config: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "expense_forms",
      paranoid: true,
      timestamps: true,
    }
  );

  ExpenseForm.associate = function (models) {
    ExpenseForm.belongsTo(models.ExpenseTeam, {
      foreignKey: "team_id",
      as: "team",
    });
    ExpenseForm.hasMany(models.ExpenseFormCategory, {
      foreignKey: "form_id",
      as: "allowedCategories",
    });
    ExpenseForm.hasMany(models.Expense, {
      foreignKey: "expense_form_id",
      as: "submissions",
    });
  };

  return ExpenseForm;
};
