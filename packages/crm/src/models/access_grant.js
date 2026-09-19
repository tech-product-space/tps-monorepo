'use strict';
const { Model } = require('sequelize');

/**
 * Generic permission grant. See migration 20260723000002 for the full rationale.
 * A resource with no grant rows for an action is open to everyone (default-open);
 * that rule lives in permission.service, not here.
 */
module.exports = (sequelize, DataTypes) => {
  class AccessGrant extends Model {
    static associate() {
      // Intentionally no FK associations: resource_id/principal_id are
      // polymorphic (product | subsource ; role | user), so they can't point
      // at a single table. Referential cleanup is handled in the controllers.
    }
  }
  AccessGrant.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    resource_type: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    resource_id: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    principal_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['role', 'user', 'everyone']] }
    },
    principal_id: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    action: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'view'
    },
    effect: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: 'allow',
      validate: { isIn: [['allow', 'deny']] }
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AccessGrant',
    tableName: 'access_grants',
    underscored: true
  });
  return AccessGrant;
};
