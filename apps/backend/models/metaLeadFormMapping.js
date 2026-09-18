"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const MetaLeadFormMapping = sequelize.define(
    "MetaLeadFormMapping",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      meta_form_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      lead_type_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "meta_lead_form_mappings",
    },
  );

  MetaLeadFormMapping.associate = (models) => {
    MetaLeadFormMapping.belongsTo(models.ExternalLeadType, {
      foreignKey: "lead_type_id",
      as: "leadType",
    });

    MetaLeadFormMapping.belongsTo(models.MetaLeadForm, {
      foreignKey: "meta_form_id",
      as: "metaForm",
    });
  };

  return MetaLeadFormMapping;
};
