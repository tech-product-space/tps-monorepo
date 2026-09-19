'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      Product.hasMany(models.Lead, { foreignKey: 'product_id', as: 'Leads' });
      Product.belongsTo(models.User, { foreignKey: 'assigned_manager_id', as: 'AssignedManager' });
      Product.hasMany(models.Subsource, { foreignKey: 'product_id', as: 'Subsources' });
    }
  }
  Product.init({
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    assigned_manager_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    intent_tier: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'Low',
      validate: { isIn: [['High', 'Low']] }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Product',
    tableName: 'products',
    underscored: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
  return Product;
};
