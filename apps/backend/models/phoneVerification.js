"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const PhoneVerification = sequelize.define(
    "PhoneVerification",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      country_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      verified_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "phone_verifications",
      timestamps: true,
    },
  );

  return PhoneVerification;
};
