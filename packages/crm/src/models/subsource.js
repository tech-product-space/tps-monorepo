'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Subsource extends Model {
    static associate(models) {
      Subsource.belongsTo(models.Product, { foreignKey: 'product_id', as: 'Product' });
      Subsource.hasMany(models.Lead, { foreignKey: 'subsource_id', as: 'Leads' });
    }
  }
  Subsource.init({
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    product_id: {
      type: DataTypes.STRING(50),
      allowNull: false
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
    modelName: 'Subsource',
    tableName: 'subsources',
    underscored: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
  return Subsource;
};
