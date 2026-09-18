'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BusinessSetting extends Model {}

  BusinessSetting.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      legal_name: { type: DataTypes.STRING(200), allowNull: true },
      trade_name: { type: DataTypes.STRING(150), allowNull: true },

      gstin: { type: DataTypes.STRING(20), allowNull: true },
      gst_percent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 18 },

      address_line1: { type: DataTypes.STRING(200), allowNull: true },
      address_line2: { type: DataTypes.STRING(200), allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      state: { type: DataTypes.STRING(100), allowNull: true },
      pincode: { type: DataTypes.STRING(20), allowNull: true },
      country: { type: DataTypes.STRING(100), allowNull: true },

      email: { type: DataTypes.STRING(255), allowNull: true },
      website: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },

      // Uploaded logo, stored as a base64 data URI.
      logo_url: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'BusinessSetting',
      tableName: 'business_settings',
      underscored: true,
    },
  );

  return BusinessSetting;
};
