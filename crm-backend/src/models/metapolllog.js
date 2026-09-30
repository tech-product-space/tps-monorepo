"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class MetaPollLog extends Model {
    static associate(models) {
      MetaPollLog.belongsTo(models.MetaAccount, {
        foreignKey: "account_id",
        as: "Account",
      });
    }
  }

  MetaPollLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      account_id: {
        type: DataTypes.UUID,
      },

      form_id: {
        type: DataTypes.STRING(100),
      },

      fetched_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      new_leads: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      duplicates: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      status: {
        type: DataTypes.STRING(50),
      },

      error: {
        type: DataTypes.TEXT,
      },
    },
    {
      sequelize,
      modelName: "MetaPollLog",
      tableName: "meta_poll_logs",
      underscored: true,
    }
  );

  return MetaPollLog;
};