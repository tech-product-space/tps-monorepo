"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class MetaForm extends Model {
    static associate(models) {
      MetaForm.belongsTo(models.MetaAccount, {
        foreignKey: "account_id",
        as: "Account",
      });
    }
  }

  MetaForm.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      account_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      form_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
      },
      status: {
        type: DataTypes.STRING(50),
      },
      product_id: {
        type: DataTypes.STRING(100),
      },
      subsource_id: {
        type: DataTypes.STRING(100),
      },
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      lead_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      last_seen_at: { type: DataTypes.DATE },

      // Backfill job state (see meta.service startBackfill/runBackfill).
      backfill_status: {
        type: DataTypes.STRING(20),
        defaultValue: "idle",
      },
      backfill_total: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      backfill_inserted: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      backfill_duplicates: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      backfill_since: { type: DataTypes.DATE },
      backfill_error: { type: DataTypes.TEXT },
      backfill_started_at: { type: DataTypes.DATE },
      backfill_finished_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      modelName: "MetaForm",
      tableName: "meta_forms",
      underscored: true,
    },
  );

  return MetaForm;
};
