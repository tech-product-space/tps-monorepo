"use strict";

module.exports = (sequelize, DataTypes) => {
  const VisitorNotificationHistory = sequelize.define(
    "VisitorNotificationHistory",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      visitorId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      page: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "VisitorNotificationHistory",
      timestamps: false,
    }
  );

  return VisitorNotificationHistory;
};
