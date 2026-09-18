

const { Model } = require("sequelize");
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  class Unsubscribe extends Model {
    static associate(models) {
      Unsubscribe.belongsTo(models.Campaign, {
        foreignKey: "campaignId",
        as: "campaign",
      });
    }
  }

  Unsubscribe.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },

      campaignId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Unsubscribe",
      tableName: "unsubscribes",
      timestamps: true,
    },
  );

  return Unsubscribe;
};
