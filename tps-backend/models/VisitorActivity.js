"use strict";

/**
 * One page view. Append-only apart from crmSyncedAt being stamped once.
 * See the migration for why this is separate from VisitorNotificationHistory.
 */
module.exports = (sequelize, DataTypes) => {
  const VisitorActivity = sequelize.define(
    "VisitorActivity",
    {
      // Generated when the view is buffered, never by the database. It travels
      // to the CRM as the primary key there, which is what makes a re-sent batch
      // a no-op — so it has to exist before the row does.
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },

      visitorId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "page_view",
      },

      page: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Contact as it was at the time of the view, not as it is now.
      name: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },
      phone: { type: DataTypes.STRING, allowNull: true },

      occurredAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      notified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      crmSyncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      meta: {
        type: DataTypes.JSONB,
        allowNull: true,
      },

      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "VisitorActivity",
      // createdAt is ours; there is no updatedAt because rows are not edited.
      timestamps: false,
    },
  );

  return VisitorActivity;
};
