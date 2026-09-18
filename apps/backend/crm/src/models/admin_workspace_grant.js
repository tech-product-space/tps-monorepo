'use strict';
const { Model } = require('sequelize');

// See migration 20260918000001 for the full rationale.
const WORKSPACES = Object.freeze(['gradient', 'tps', 'crm']);

module.exports = (sequelize, DataTypes) => {
  class AdminWorkspaceGrant extends Model {
    static associate(models) {
      AdminWorkspaceGrant.belongsTo(models.User, { foreignKey: 'user_id', as: 'User' });
    }
  }
  AdminWorkspaceGrant.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    workspace: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [WORKSPACES] },
    },
    role: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    granted_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'AdminWorkspaceGrant',
    tableName: 'admin_workspace_grants',
    underscored: true,
  });
  return AdminWorkspaceGrant;
};

module.exports.WORKSPACES = WORKSPACES;
