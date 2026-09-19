import { ulid } from "ulid";

/**
 * Singleton. The runtime polling switch, toggled from the panel.
 *
 * Never seeded by a migration — `metaSettings.get()` creates it on first read,
 * so a fresh database, a restored dump and a rolled-back migration all end up
 * in the same state instead of one of them booting with polling silently off.
 */
export default (sequelize, DataTypes) => {
  const MetaSettings = sequelize.define(
    "MetaSettings",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      pollEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      lastPollAt: { type: DataTypes.DATE, allowNull: true },
      lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "meta_settings",
      timestamps: true,
    },
  );

  return MetaSettings;
};
