'use strict';
const { Model } = require('sequelize');

/**
 * One page view. Append-only, never updated, never linked to a lead.
 *
 * Deliberately has no associations. The person is found at read time by joining
 * on `phone`, which is what lets someone's browsing survive them not existing in
 * the CRM yet — see the migration for the full reasoning.
 */
module.exports = (sequelize, DataTypes) => {
  class WebsiteActivity extends Model {}

  WebsiteActivity.init(
    {
      // TPS's id, supplied with every row. No default: a row without one is a
      // bug upstream, and we would rather fail loudly than mint an id that makes
      // the same view insertable twice.
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      visitor_id: { type: DataTypes.STRING(64), allowNull: false },
      // Digits only. The join key to lead_profiles.
      phone: { type: DataTypes.STRING(20), allowNull: true },
      // Contact as it was at the time of the view, not as it is now.
      name: { type: DataTypes.STRING(150), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      page_url: { type: DataTypes.STRING(500), allowNull: false },
      page_label: { type: DataTypes.STRING(200), allowNull: true },
      section: { type: DataTypes.STRING(100), allowNull: true },
      type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'page_view',
      },
      occurred_at: { type: DataTypes.DATE, allowNull: false },
      meta: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      sequelize,
      modelName: 'WebsiteActivity',
      tableName: 'website_activity',
      underscored: true,
      // Rows are written once and read forever.
      updatedAt: false,
    },
  );

  return WebsiteActivity;
};
