import { ulid } from "ulid";

import { META_TOKEN_STATUS } from "../../../config/constants/metaLead.js";

/**
 * A Facebook Page the lead poll reads from.
 *
 * `pageTokenEnc` is a credential and never leaves the server — use
 * `toSafeJSON()` for anything that reaches a browser. The service layer is
 * responsible for that, but the method lives here so there is one definition of
 * "safe" rather than one per controller.
 */
export default (sequelize, DataTypes) => {
  const MetaAccount = sequelize.define(
    "MetaAccount",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      pageId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      pageTokenEnc: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      /** Routing fallback for a form with no mapping of its own. */
      defaultSourceId: { type: DataTypes.STRING, allowNull: true },
      defaultSubSourceId: { type: DataTypes.STRING, allowNull: true },
      defaultCourseId: { type: DataTypes.STRING, allowNull: true },

      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      tokenStatus: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: META_TOKEN_STATUS.UNKNOWN,
        validate: {
          isIn: [Object.values(META_TOKEN_STATUS)],
        },
      },

      tokenCheckedAt: { type: DataTypes.DATE, allowNull: true },
      lastSyncedAt: { type: DataTypes.DATE, allowNull: true },
      lastPolledAt: { type: DataTypes.DATE, allowNull: true },

      lastError: { type: DataTypes.TEXT, allowNull: true },

      alertedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "meta_accounts",
      timestamps: true,
    },
  );

  /**
   * The only shape an account may take on its way to a browser.
   *
   * `hasToken` rather than the token: the panel needs to know whether one is
   * configured (to label the field "leave blank to keep") and must never be
   * able to read it back, not even encrypted.
   */
  MetaAccount.prototype.toSafeJSON = function toSafeJSON(extra = {}) {
    const { pageTokenEnc, ...rest } = this.toJSON();

    return { ...rest, hasToken: Boolean(pageTokenEnc), ...extra };
  };

  MetaAccount.associate = (models) => {
    MetaAccount.hasMany(models.MetaForm, {
      foreignKey: "accountId",
      as: "forms",
    });

    MetaAccount.hasMany(models.MetaLead, {
      foreignKey: "accountId",
      as: "leads",
    });

    MetaAccount.belongsTo(models.MetaSource, {
      foreignKey: "defaultSourceId",
      as: "defaultSource",
    });

    MetaAccount.belongsTo(models.MetaSource, {
      foreignKey: "defaultSubSourceId",
      as: "defaultSubSource",
    });
  };

  return MetaAccount;
};
