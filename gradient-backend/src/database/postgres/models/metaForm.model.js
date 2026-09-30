import { ulid } from "ulid";

import { META_BACKFILL_STATUS } from "../../../config/constants/metaLead.js";

/**
 * A cached Facebook lead form, and the routing an admin gave it.
 *
 * The poll reads active forms from this table and never calls
 * `/leadgen_forms`. Only an explicit sync — the button or the hourly job —
 * refreshes the cache, and a sync writes `name`, `status` and `lastSeenAt`
 * only. The mapping columns belong to the admin.
 */
export default (sequelize, DataTypes) => {
  const MetaForm = sequelize.define(
    "MetaForm",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      accountId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      formId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.STRING(50), allowNull: true },

      /** Picked from `meta_sources`, not typed. Null → the account default. */
      sourceId: { type: DataTypes.STRING, allowNull: true },
      subSourceId: { type: DataTypes.STRING, allowNull: true },
      courseId: { type: DataTypes.STRING, allowNull: true },

      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      leadCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      lastSeenAt: { type: DataTypes.DATE, allowNull: true },

      backfillStatus: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: [[...Object.values(META_BACKFILL_STATUS), null]],
        },
      },
      backfillTotal: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillInserted: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillAlreadyImported: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillSkipped: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillSince: { type: DataTypes.DATE, allowNull: true },
      backfillStartedAt: { type: DataTypes.DATE, allowNull: true },
      backfillFinishedAt: { type: DataTypes.DATE, allowNull: true },
      backfillError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "meta_forms",
      timestamps: true,
    },
  );

  /**
   * True when this form has no routing and can only fall back.
   *
   * The panel warns on it and refuses to start a backfill, because routing is
   * frozen onto the lead at import — an unmapped backfill of four thousand
   * leads cannot be corrected by fixing the mapping afterwards.
   */
  MetaForm.prototype.isUnmapped = function isUnmapped() {
    return !this.sourceId && !this.subSourceId && !this.courseId;
  };

  MetaForm.associate = (models) => {
    MetaForm.belongsTo(models.MetaAccount, {
      foreignKey: "accountId",
      as: "account",
    });

    MetaForm.belongsTo(models.MetaSource, {
      foreignKey: "sourceId",
      as: "source",
    });

    MetaForm.belongsTo(models.MetaSource, {
      foreignKey: "subSourceId",
      as: "subSource",
    });
  };

  return MetaForm;
};
