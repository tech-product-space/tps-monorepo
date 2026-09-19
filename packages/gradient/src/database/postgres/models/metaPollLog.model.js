import { ulid } from "ulid";

import { META_POLL_LOG_STATUS } from "../../../config/constants/metaLead.js";

/**
 * One row per form per run. Append-only — nothing updates or deletes these.
 *
 * `alreadyImported` counts Facebook leads we had already stored, which is the
 * expected product of the poll's overlap window and should be non-zero on a
 * healthy system. It is **not** the `duplicate` lead status, which means a
 * second submission by the same person. Two different questions, two different
 * words.
 */
export default (sequelize, DataTypes) => {
  const MetaPollLog = sequelize.define(
    "MetaPollLog",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      accountId: { type: DataTypes.STRING, allowNull: true },
      formId: { type: DataTypes.STRING, allowNull: true },

      fetchedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      newLeads: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      alreadyImported: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skipped: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: META_POLL_LOG_STATUS.SUCCESS,
        validate: {
          isIn: [Object.values(META_POLL_LOG_STATUS)],
        },
      },

      error: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "meta_poll_logs",
      timestamps: true,
    },
  );

  MetaPollLog.associate = (models) => {
    MetaPollLog.belongsTo(models.MetaAccount, {
      foreignKey: "accountId",
      as: "account",
      constraints: false,
    });
  };

  return MetaPollLog;
};
