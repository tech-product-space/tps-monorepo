"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class MetaAccount extends Model {
    static associate(models) {
      MetaAccount.hasMany(models.MetaForm, {
        foreignKey: "account_id",
        as: "Forms",
      });
    }
  }

  MetaAccount.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      page_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      page_token_enc: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      default_product_id: {
        type: DataTypes.STRING(100),
      },
      default_subsource_id: {
        type: DataTypes.STRING(100),
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      token_status: {
        type: DataTypes.STRING(20),
        defaultValue: "unknown",
      },
      token_checked_at: { type: DataTypes.DATE },
      last_synced_at: { type: DataTypes.DATE },
      last_polled_at: { type: DataTypes.DATE },
      last_error: { type: DataTypes.TEXT },
    },
    {
      sequelize,
      modelName: "MetaAccount",
      tableName: "meta_accounts",
      underscored: true,
    },
  );

  return MetaAccount;
};
