"use strict";
const { ulid } = require("ulid");
const {
  fireAfterCreate,
} = require("../service/workflow/triggers/hookHelper");

module.exports = (sequelize, DataTypes) => {
  const ExternalLead = sequelize.define(
    "ExternalLead",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      name: DataTypes.STRING,

      email: DataTypes.STRING,

      phone: DataTypes.STRING,

      source: {
        type: DataTypes.STRING,
      },

      type_id: {
        type: DataTypes.STRING,
      },

      external_form_id: {
        type: DataTypes.STRING,
      },
      external_lead_id: {
        type: DataTypes.STRING,
      },

      external_created_at: {
        type: DataTypes.DATE,
      },

      form_data: {
        type: DataTypes.JSONB,
      },

      additional_data: {
        type: DataTypes.JSONB,
      },
    },
    {
      tableName: "external_leads",
      indexes: [
        {
          // One row per Meta lead per lead type — a lead mapped to several
          // types gets one row in each (see unique-per-type migration).
          unique: true,
          fields: ["external_lead_id", "type_id"],
          name: "external_leads_lead_id_type_id_unique",
        },
      ],
      hooks: {
        // Single insert (admin form / API)
        afterCreate: (row, options) =>
          fireAfterCreate("external_leads", row.id, options),
        // Meta sync uses bulkCreate — loop and fire per row. We don't pass
        // individualHooks:true upstream because that touches the existing
        // Meta sync code; this hook gets the same effect without modifying
        // the campaign feature.
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            fireAfterCreate("external_leads", row.id, options);
          }
        },
      },
    },
  );

  ExternalLead.associate = (models) => {
    ExternalLead.belongsTo(models.ExternalLeadType, {
      foreignKey: "type_id",
      as: "leadType",
    });
  };

  return ExternalLead;
};
