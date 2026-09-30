"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class MeetingNotification extends Model {
    static associate(models) {
      MeetingNotification.belongsTo(models.Meeting, {
        foreignKey: "meeting_id",
        as: "Meeting",
      });
    }
  }
  MeetingNotification.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      meeting_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      start_time: { type: DataTypes.DATE, allowNull: false },
      kind: { type: DataTypes.STRING(10), allowNull: false },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "MeetingNotification",
      tableName: "meeting_notifications",
      underscored: true,
      updatedAt: false,
      createdAt: false,
    },
  );
  return MeetingNotification;
};
