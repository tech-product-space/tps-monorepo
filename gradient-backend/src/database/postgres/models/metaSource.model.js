import { ulid } from "ulid";

/**
 * A managed source or sub source.
 *
 * Two levels in one table: `parentId IS NULL` is a source, `parentId` set is a
 * sub source of it. See the migration for why this replaced free-text routing
 * fields, and why the unique indexes are partial.
 *
 * Nothing here is written onto a lead directly — `resolveRouting` copies `key`
 * and `displayName` onto the lead at import, frozen. Renaming a source later
 * changes the picker, not history.
 */
export default (sequelize, DataTypes) => {
  const MetaSource = sequelize.define(
    "MetaSource",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      key: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          // Normalised here so every write path agrees — a controller that
          // forgets to trim cannot introduce "facebook " as a second source.
          this.setDataValue(
            "key",
            String(value ?? "")
              .trim()
              .toLowerCase()
              .replace(/\s+/g, "-"),
          );
        },
        validate: {
          notEmpty: { msg: "key is required" },
          is: {
            args: /^[a-z0-9][a-z0-9-]*$/,
            msg: "key may contain only lowercase letters, numbers and hyphens",
          },
        },
      },

      displayName: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          this.setDataValue("displayName", String(value ?? "").trim());
        },
        validate: {
          notEmpty: { msg: "displayName is required" },
        },
      },

      parentId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "meta_sources",
      timestamps: true,
    },
  );

  MetaSource.prototype.isRoot = function isRoot() {
    return this.parentId === null || this.parentId === undefined;
  };

  MetaSource.associate = (models) => {
    MetaSource.belongsTo(models.MetaSource, {
      foreignKey: "parentId",
      as: "parent",
    });

    MetaSource.hasMany(models.MetaSource, {
      foreignKey: "parentId",
      as: "subSources",
    });
  };

  return MetaSource;
};
