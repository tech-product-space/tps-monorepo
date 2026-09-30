"use strict";
const { Model } = require("sequelize");
const {
  fireAfterCreate,
} = require("../service/workflow/triggers/hookHelper");

module.exports = (sequelize, DataTypes) => {
  class PlatformLead extends Model {
    static associate(models) {
      PlatformLead.hasOne(models.PhoneVerification, {
        foreignKey: "phone",
        sourceKey: "phone",
        as: "phoneVerification",
        constraints: false,
      });
    }
  }

  PlatformLead.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          "Not interested",
          "Positive",
          "Hot Lead",
          "Next Cohort",
          "Paid",
        ),
        allowNull: false,
        defaultValue: "Positive",
      },
      assignedTo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      additionalData: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      airtableSynced: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      airtableSyncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      leads91Synced: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      leads91SyncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "PlatformLead",
      tableName: "platform_leads",
      hooks: {
        afterCreate: (row, options) =>
          fireAfterCreate("platform_leads", row.id, options),
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            fireAfterCreate("platform_leads", row.id, options);
          }
        },
      },
    },
  );

  return PlatformLead;
};
