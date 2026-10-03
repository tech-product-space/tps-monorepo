"use strict";

// Replaces models/mongo/Otp.js. Attribute names stay camelCase so the OTP and
// platform-lead controllers keep their field names; columns are snake_case
// (see scripts/mongo-to-pg.schema.sql). Mongo expired these via a TTL index;
// here an expired row is rejected and deleted on read in otpController.
module.exports = (sequelize, DataTypes) => {
  const Otp = sequelize.define(
    "Otp",
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      phone: { type: DataTypes.TEXT, allowNull: false },
      countryCode: { type: DataTypes.TEXT, allowNull: false, field: "country_code" },
      entity: { type: DataTypes.TEXT, allowNull: false },
      entityIdentifier: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: "entity_identifier",
        // Callers pass lead.id (a number); Mongo stored it as a string.
        set(value) {
          this.setDataValue("entityIdentifier", value == null ? value : String(value));
        },
      },
      otp: { type: DataTypes.TEXT, allowNull: false },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      retryAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "retry_attempts" },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
    },
    {
      tableName: "otps",
      timestamps: true,
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      underscored: true,
    }
  );

  // OTP tokens issued before the switch carry a Mongo ObjectId; a BIGINT
  // lookup on that would raise a Postgres error, so treat it as not found.
  Otp.findByTokenId = (otpId) => {
    const id = String(otpId ?? "");
    if (!/^\d+$/.test(id)) return null;
    return Otp.findByPk(id);
  };

  return Otp;
};
