"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const MetaLeadForm = sequelize.define(
    "MetaLeadForm",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      page_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      form_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      form_name: DataTypes.STRING,

      status: DataTypes.STRING,

      metadata: DataTypes.JSONB,
    },
    {
      tableName: "meta_lead_forms",
    },
  );

  MetaLeadForm.associate = (models) => {
    MetaLeadForm.hasMany(models.MetaLeadFormMapping, {
      foreignKey: "meta_form_id",
      as: "leadTypeMappings",
    });

    MetaLeadForm.belongsTo(models.MetaPage, {
      foreignKey: "page_id",
      as: "page",
    });
  };

  return MetaLeadForm;
};
