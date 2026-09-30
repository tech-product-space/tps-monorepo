'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmailTemplate extends Model {
    static associate(models) {
      EmailTemplate.belongsTo(models.Event, { foreignKey: 'eventId', as: 'event' });
    }
  }

  EmailTemplate.init(
    {
      eventId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      subject: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      date: {   // ✅ new field
        type: DataTypes.DATEONLY, // YYYY-MM-DD only
        allowNull: true,
      },
      startTime: {   // ✅ new field
        type: DataTypes.TIME,
        allowNull: true,
      },
      endTime: {   // ✅ new field
        type: DataTypes.TIME,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'EmailTemplate',
      tableName: 'EmailTemplates',
      indexes: [
        {
          unique: true,
          fields: ['eventId', 'type'],
        },
      ],
    }
  );

  return EmailTemplate;
};
