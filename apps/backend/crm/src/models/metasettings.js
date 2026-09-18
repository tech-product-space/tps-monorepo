"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class MetaSettings extends Model {
    static associate() {}
  }

  MetaSettings.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      poll_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      last_poll_at: { type: DataTypes.DATE },
      last_sync_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      modelName: "MetaSettings",
      tableName: "meta_settings",
      underscored: true,
    },
  );

  return MetaSettings;
};
