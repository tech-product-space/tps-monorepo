"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const ExternalLeadType = sequelize.define(
    "ExternalLeadType",
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

      description: {
        type: DataTypes.TEXT,
      },
    },
    {
      tableName: "external_lead_types",
    },
  );

  ExternalLeadType.associate = (models) => {
    ExternalLeadType.hasMany(models.MetaLeadFormMapping, {
      foreignKey: "lead_type_id",
    });
  };

  return ExternalLeadType;
};
