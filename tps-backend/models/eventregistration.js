'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EventRegistration extends Model {
    static associate(models) {
      EventRegistration.belongsTo(models.users, { foreignKey: 'userId', as: 'user' });
      EventRegistration.belongsTo(models.ReferralCode, { foreignKey: 'referredByCode', targetKey: 'code', as: 'referral' });
    }
  }
  EventRegistration.init({
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    eventName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    referredByCode: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'EventRegistration',
  });
  return EventRegistration;
};
