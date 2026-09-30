"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const MetaIntegration = sequelize.define(
    "MetaIntegration",
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        defaultValue: () => ulid(),
      },
      account_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      account_name: {
        type: DataTypes.STRING,
      },

      access_token: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      metadata: DataTypes.JSONB,
    },
    {
      tableName: "meta_integrations",
    },
  );

  return MetaIntegration;
};
