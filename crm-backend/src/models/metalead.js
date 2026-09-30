"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class MetaLead extends Model {
    static associate(models) {
      MetaLead.belongsTo(models.Lead, {
        foreignKey: "lead_id",
        as: "Lead",
      });
    }
  }

  MetaLead.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      meta_lead_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },

      form_id: {
        type: DataTypes.STRING(100),
      },

      ad_id: {
        type: DataTypes.STRING(100),
      },

      adset_id: {
        type: DataTypes.STRING(100),
      },

      campaign_id: {
        type: DataTypes.STRING(100),
      },

      page_id: {
        type: DataTypes.STRING(100),
      },

      lead_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      raw_payload: {
        type: DataTypes.JSONB,
      },
    },
    {
      sequelize,
      modelName: "MetaLead",
      tableName: "meta_leads",
      underscored: true,
    }
  );

  return MetaLead;
};