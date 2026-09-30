"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class UserAppToken extends Model {
    static associate(models) {
      // no relation with Users
    }
  }

  UserAppToken.init(
    {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      apps: {
        type: DataTypes.ENUM("GOOGLE", "MICROSOFT"),
        allowNull: false,
      },
      access_token: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      refresh_token: {
        type: DataTypes.TEXT,
      },
      generated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "UserAppToken",
      indexes: [
        {
          unique: true,
          fields: ["user_id", "apps"],
        },
      ],
    }
  );

  return UserAppToken;
};
