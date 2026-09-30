'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Target extends Model {
    static associate(models) {
      Target.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
    }
  }
  Target.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      target_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['revenue', 'leads', 'conversions']] },
      },
      scope_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['org', 'manager', 'agent']] },
      },
      scope_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      period_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['month', 'quarter', 'custom']] },
      },
      period_start: { type: DataTypes.DATEONLY, allowNull: false },
      period_end: { type: DataTypes.DATEONLY, allowNull: false },
      value: { type: DataTypes.BIGINT, allowNull: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Target',
      tableName: 'targets',
      underscored: true,
    },
  );
  return Target;
};
