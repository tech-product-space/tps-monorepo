"use strict";
const { Model } = require("sequelize");
const { ulid } = require("ulid");
const { EVENT_EMAIL_TARGET_TYPES, EVENT_EMAIL_TEMPLATE_STATUS, EVENT_EMAIL_TARGET_ROLES } = require("../constants/event");

module.exports = (sequelize, DataTypes) => {
  class EventEmailTemplate extends Model {
    static associate(models) {
      EventEmailTemplate.belongsTo(models.Event, {
        foreignKey: "eventId",
        as: "event",
        onDelete: "CASCADE",
      });
    }
  }

  EventEmailTemplate.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      eventId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      templateName: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      subject: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      targetGuestType: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EVENT_EMAIL_TARGET_TYPES.ALL,
        validate: {
          isIn: [Object.values(EVENT_EMAIL_TARGET_TYPES)],
        },
      },

      targetGuestRole: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EVENT_EMAIL_TARGET_ROLES.ALL,
        validate: {
          isIn: [Object.values(EVENT_EMAIL_TARGET_ROLES)],
        },
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EVENT_EMAIL_TEMPLATE_STATUS.DRAFT,
        validate: {
          isIn: [Object.values(EVENT_EMAIL_TEMPLATE_STATUS)],
        },
      },
      
    },
    {
      sequelize,
      modelName: "EventEmailTemplate",
      tableName: "EventEmailTemplates",
      timestamps: true,
    }
  );

  return EventEmailTemplate;
};
