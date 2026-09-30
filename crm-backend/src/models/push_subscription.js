"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class PushSubscription extends Model {
    static associate(models) {
      PushSubscription.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "User",
      });
    }
  }
  PushSubscription.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      endpoint: { type: DataTypes.TEXT, allowNull: false, unique: true },
      p256dh: { type: DataTypes.TEXT, allowNull: false },
      auth: { type: DataTypes.TEXT, allowNull: false },
      user_agent: { type: DataTypes.STRING(500), allowNull: true },
    },
    {
      sequelize,
      modelName: "PushSubscription",
      tableName: "push_subscriptions",
      underscored: true,
    },
  );
  return PushSubscription;
};
