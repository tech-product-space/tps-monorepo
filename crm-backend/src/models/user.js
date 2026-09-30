'use strict';
const { Model } = require('sequelize');
const { ALL_ROLES } = require('../config/constants/roles');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.User, { foreignKey: 'manager_id', as: 'Manager' });
      User.hasMany(models.User, { foreignKey: 'manager_id', as: 'Subordinates' });
      User.hasMany(models.Lead, { foreignKey: 'agent_id', as: 'Leads' });
      User.hasMany(models.Activity, { foreignKey: 'actor_id', as: 'Activities' });
    }
  }
  User.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true }
    },
    phone: {
      type: DataTypes.STRING(20)
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [[...ALL_ROLES]] }
    },
    manager_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    underscored: true
  });
  return User;
};
