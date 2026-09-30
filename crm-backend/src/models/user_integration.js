"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class UserIntegration extends Model {
    static associate(models) {
      UserIntegration.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "User",
      });
    }
  }
  UserIntegration.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      provider: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "google",
      },
      google_email: { type: DataTypes.STRING(255), allowNull: true },
      access_token_enc: { type: DataTypes.TEXT, allowNull: true },
      access_token_expires_at: { type: DataTypes.DATE, allowNull: true },
      refresh_token_enc: { type: DataTypes.TEXT, allowNull: false },
      scope: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "connected",
        validate: { isIn: [["connected", "revoked", "error"]] },
      },
      last_error: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: "UserIntegration",
      tableName: "user_integrations",
      underscored: true,
    },
  );
  return UserIntegration;
};
