'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WebsiteVisit extends Model {
    static associate(models) {
      WebsiteVisit.belongsTo(models.LeadProfile, {
        foreignKey: 'profile_id',
        as: 'Profile',
      });
      WebsiteVisit.belongsTo(models.Lead, {
        foreignKey: 'lead_id',
        as: 'Lead',
      });
    }
  }

  WebsiteVisit.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // TPS's own record id. Unique — this is what makes a re-delivered visit a
      // no-op instead of a second history line and another lead bump.
      source_event_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      visitor_id: { type: DataTypes.STRING(64), allowNull: false },
      // Null when the visitor could not be matched to anyone — see the migration.
      profile_id: { type: DataTypes.UUID, allowNull: true },
      lead_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      page_url: { type: DataTypes.STRING(500), allowNull: false },
      page_label: { type: DataTypes.STRING(200), allowNull: true },
      section: { type: DataTypes.STRING(100), allowNull: true },
      entry_type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'page_view',
      },
      occurred_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: 'WebsiteVisit',
      tableName: 'website_visits',
      underscored: true,
    },
  );

  return WebsiteVisit;
};
