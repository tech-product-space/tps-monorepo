"use strict";
const { Model } = require("sequelize");
const resolveTime = require("../utils/helper/resolveTime");

function setSourceTime(lead) {
  if (lead.source_created_at) return;

  const extra = lead.extra_fields || {};

  const resolved =
    resolveTime(extra.timeStamp) ||
    resolveTime(extra.timestamp) ||
    resolveTime(extra.created_time);

  lead.source_created_at = resolved || new Date();
}

module.exports = (sequelize, DataTypes) => {
  class Lead extends Model {
    static associate(models) {
      Lead.belongsTo(models.LeadProfile, {
        foreignKey: "profile_id",
        as: "Profile",
      });
      Lead.belongsTo(models.User, { foreignKey: "agent_id", as: "Agent" });
      Lead.belongsTo(models.Status, {
        foreignKey: "status_id",
        as: "StatusConfig",
      });
      Lead.belongsTo(models.Product, {
        foreignKey: "product_id",
        as: "ProductConfig",
      });
      Lead.belongsTo(models.Subsource, {
        foreignKey: "subsource_id",
        as: "SubsourceConfig",
      });
      Lead.hasMany(models.Activity, {
        foreignKey: "lead_id",
        as: "Activities",
      });
      Lead.hasMany(models.LeadNote, { foreignKey: "lead_id", as: "Notes" });
      Lead.hasMany(models.LeadHistory, {
        foreignKey: "lead_id",
        as: "History",
      });
    }
  }
  Lead.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      profile_id: { type: DataTypes.UUID, allowNull: false },
      product_id: { type: DataTypes.STRING(50) },
      subsource_id: { type: DataTypes.STRING(50), allowNull: true },
      status_id: { type: DataTypes.STRING(50), allowNull: false },
      next_followup: { type: DataTypes.DATE },
      agent_id: { type: DataTypes.UUID },
      assigned_at: { type: DataTypes.DATE, allowNull: true },
      loss_reason: { type: DataTypes.STRING(500) },
      utm_id: { type: DataTypes.STRING(100) },
      utm_source: { type: DataTypes.STRING(100) },
      utm_medium: { type: DataTypes.STRING(100) },
      utm_campaign: { type: DataTypes.STRING(200) },
      utm_content: { type: DataTypes.STRING(200) },
      extra_fields: { type: DataTypes.JSONB, allowNull: true },
      additional_data: { type: DataTypes.JSONB, allowNull: true },
      lead_update_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      source_created_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Lead",
      tableName: "leads",
      underscored: true,
      hooks: {
        beforeCreate: (lead) => {
          setSourceTime(lead);
        },

        beforeBulkCreate: (leads) => {
          for (const lead of leads) {
            setSourceTime(lead);
          }
        },
      },
    },
  );
  return Lead;
};
