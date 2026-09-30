"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class FollowupNotification extends Model {
    static associate(models) {
      FollowupNotification.belongsTo(models.Lead, {
        foreignKey: "lead_id",
        as: "Lead",
      });
    }
  }
  FollowupNotification.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lead_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: true },
      followup_at: { type: DataTypes.DATE, allowNull: false },
      kind: { type: DataTypes.STRING(10), allowNull: false },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "FollowupNotification",
      tableName: "followup_notifications",
      underscored: true,
      updatedAt: false,
      createdAt: false,
    },
  );
  return FollowupNotification;
};
