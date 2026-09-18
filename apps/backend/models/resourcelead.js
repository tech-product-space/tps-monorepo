"use strict";
const { Model } = require("sequelize");
const {
  fireAfterCreate,
} = require("../service/workflow/triggers/hookHelper");

module.exports = (sequelize, DataTypes) => {
  class ResourceLead extends Model {
    static associate(models) {
      // Lead belongs to one Resource
      ResourceLead.belongsTo(models.Resource, {
        foreignKey: "resourceId",
        as: "resource",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  }

  ResourceLead.init(
    {
      name: DataTypes.STRING,
      email: DataTypes.STRING,
      phone: DataTypes.STRING,
      jobTitle: DataTypes.STRING,
      resourceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      additionalData: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
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
      modelName: "ResourceLead",
      tableName: "ResourceLeads",
      hooks: {
        afterCreate: (row, options) =>
          fireAfterCreate("resources", row.id, options),
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            fireAfterCreate("resources", row.id, options);
          }
        },
      },
    }
  );

  return ResourceLead;
};
