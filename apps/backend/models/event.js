"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Event extends Model {
    static associate(models) {
      Event.hasMany(models.EventGuests, {
        foreignKey: "eventId",
        as: "guests",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      Event.hasMany(models.EventEmailReminder, {
        foreignKey: "eventId",
        as: "emailReminders",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      Event.hasMany(models.EmailTemplate, {
        foreignKey: "eventId",
        as: "emailTemplates",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  }

  Event.init(
    {
      eventTitle: DataTypes.STRING,
      eventSubtitle: DataTypes.STRING,
      eventStartDate: DataTypes.STRING,
      eventEndDate: DataTypes.STRING,
      eventStartTime: DataTypes.STRING,
      eventEndTime: DataTypes.STRING,
      speakers: DataTypes.JSONB,
      numberOfAttendees: DataTypes.INTEGER,
      eventCreativeUrl: DataTypes.STRING,
      isPublished: DataTypes.BOOLEAN,
      eventType: DataTypes.ENUM("Teardown", "Hackathon", "Workshop"),
      eventCategory: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Normal",
        validate: {
          isIn: [["Community", "Normal", "MicroCertificate", "GenAiMicroCertificate", "Claude", "ClaudeOneDay", "InternalCohort"]]
        }
      },
      ctaType: DataTypes.ENUM("Join Waitlist", "Register Now"),
      location: DataTypes.TEXT,
      locationType: DataTypes.TEXT,
      tags: DataTypes.ARRAY(DataTypes.STRING),
      eventDetails: DataTypes.JSONB,
      eventSlug: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      canAcceptResponse: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: "Event",
      tableName: "Events",
      timestamps: true,
    }
  );

  return Event;
};
