"use strict";

module.exports = (sequelize, DataTypes) => {
  const Visitor = sequelize.define(
    "Visitor",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },

      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      lastVisitedUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      firstSeen: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      lastSeen: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      notifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      isBlocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      blockingReason: {
        type: DataTypes.STRING,
        allowNull: true,
      }
    },
    {
      tableName: "Visitors",
      timestamps: true,
    }
  );

  Visitor.associate = function (models) {
    Visitor.hasMany(models.VisitorContact, {
      foreignKey: "visitorId",
      as: "contacts",
    });
  };

  return Visitor;
};
