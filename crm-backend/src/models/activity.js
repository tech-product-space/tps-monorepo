'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Activity extends Model {
    static associate(models) {
      Activity.belongsTo(models.Lead, { foreignKey: 'lead_id', as: 'Lead' });
      Activity.belongsTo(models.LeadProfile, { foreignKey: 'profile_id', as: 'Profile' });
      Activity.belongsTo(models.User, { foreignKey: 'actor_id', as: 'Actor' });
    }
  }
  Activity.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    lead_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    actor_id: {
      type: DataTypes.UUID
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [['Note', 'Call', 'StatusChange', 'FollowUp', 'Assignment', 'System', 'Audit', 'Payment']]
      }
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    details: {
      type: DataTypes.TEXT
    },
    metadata: {
      type: DataTypes.JSONB
    }
  }, {
    sequelize,
    modelName: 'Activity',
    tableName: 'activities',
    underscored: true
  });
  return Activity;
};
