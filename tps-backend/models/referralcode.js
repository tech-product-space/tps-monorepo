'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReferralCode extends Model {
    static associate(models) {
      ReferralCode.belongsTo(models.users, { foreignKey: 'userId', as: 'referrer' });
      ReferralCode.hasMany(models.EventRegistration, { foreignKey: 'referredByCode', sourceKey: 'code', as: 'registrations' });
    }
  }

  ReferralCode.init({
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'ReferralCode',
  });

  return ReferralCode;
};
