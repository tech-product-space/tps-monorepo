"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class LeadHistory extends Model {
    static associate(models) {
      LeadHistory.belongsTo(models.Lead, {
        foreignKey: "lead_id",
        as: "Lead",
      });
      LeadHistory.belongsTo(models.User, {
        foreignKey: "changed_by",
        as: "Actor",
      });
    }
  }

  LeadHistory.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lead_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      profile_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      subsource_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      utm_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      utm_source: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      utm_medium: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      utm_campaign: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      utm_content: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      extra_fields: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      additional_data: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      source_created_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      changed_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      change_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [["created", "reentry_same_product", "reentry_new_product"]],
        },
      },
      source: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "LeadHistory",
      tableName: "lead_history",
      underscored: true,
      // History rows are immutable — no updatedAt
      updatedAt: false,
      createdAt: false,
    },
  );

  return LeadHistory;
};