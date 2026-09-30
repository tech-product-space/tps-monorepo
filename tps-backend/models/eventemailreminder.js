'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class EventEmailReminder extends Model {
    static associate(models) {
      EventEmailReminder.belongsTo(models.Event, {
        foreignKey: 'eventId',
        as: 'event',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    }
  }

  EventEmailReminder.init({
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING
    },
    email: {
      type: DataTypes.JSONB
    }
  }, {
    sequelize,
    modelName: 'EventEmailReminder',
    tableName: 'EventEmailReminders',
    timestamps: true
  });

  return EventEmailReminder;
};
