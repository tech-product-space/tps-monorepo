"use strict";

const {
  fireAfterCreate,
} = require("../service/workflow/triggers/hookHelper");

module.exports = (sequelize, DataTypes) => {
  const EventGuests = sequelize.define(
    "EventGuests",
    {
      linkedin: DataTypes.STRING,
      name: DataTypes.STRING,
      phone: DataTypes.STRING,
      referralCode: DataTypes.STRING,
      role: DataTypes.STRING,
      graduationYear: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      collegeName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      userType: DataTypes.STRING,
      eventType: DataTypes.STRING,
      guestType: DataTypes.STRING,
      eventName: DataTypes.STRING,
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      eventId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      feedbackData: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      feedbackSubmittedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      certificateGenerated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      certificateId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      certificateGeneratedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      certificateName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      certificateApproved: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      additionalData: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      leads91Synced: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      leads91SyncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "EventGuests",
      timestamps: true,
      hooks: {
        afterCreate: (row, options) =>
          fireAfterCreate("events", row.id, options),
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            fireAfterCreate("events", row.id, options);
          }
        },
      },
    }
  );

  EventGuests.associate = function (models) {
    EventGuests.belongsTo(models.users, {
      foreignKey: "userId",
      as: "user",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    EventGuests.belongsTo(models.Event, {
      foreignKey: "eventId",
      as: "event",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return EventGuests;
};
