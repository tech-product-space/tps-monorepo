"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const MetaPage = sequelize.define(
    "MetaPage",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      integration_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      page_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      page_name: DataTypes.STRING,

      page_access_token: DataTypes.TEXT,

      metadata: DataTypes.JSONB,
    },
    {
      tableName: "meta_pages",
    },
  );

  MetaPage.associate = (models) => {
    MetaPage.hasMany(models.MetaLeadForm, {
      foreignKey: "page_id",
      as: "forms",
    });
  };

  return MetaPage;
};
