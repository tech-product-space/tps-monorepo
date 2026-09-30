"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class WhatsappTemplate extends Model {
    static associate(models) {
      WhatsappTemplate.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "Creator",
      });
    }
  }

  WhatsappTemplate.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "WhatsappTemplate",
      tableName: "whatsapp_templates",
      underscored: true,
    }
  );

  return WhatsappTemplate;
};
