'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeadNote extends Model {
    static associate(models) {
      LeadNote.belongsTo(models.Lead, { foreignKey: 'lead_id', as: 'Lead' });
      LeadNote.belongsTo(models.LeadProfile, { foreignKey: 'profile_id', as: 'Profile' });
      LeadNote.belongsTo(models.User, { foreignKey: 'actor_id', as: 'Actor' });
    }
  }

  LeadNote.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    lead_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    actor_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: { isIn: [['Note', 'Conversation']] },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'LeadNote',
    tableName: 'lead_notes',
    underscored: true,
  });

  return LeadNote;
};
