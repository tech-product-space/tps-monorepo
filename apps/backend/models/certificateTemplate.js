'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CertificateTemplate extends Model {
    static associate(models) {
      CertificateTemplate.belongsTo(models.Event, {
        foreignKey: 'eventId',
        as: 'event',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    }
  }

  CertificateTemplate.init({
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Events',
        key: 'id'
      }
    },
    certificateName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    imageSize: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    fields: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    templateImage: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    emailSubject: {
      type: DataTypes.STRING,
      allowNull: true
    },
    emailBody: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'CertificateTemplate',
    tableName: 'CertificateTemplates',
    timestamps: true
  });

  return CertificateTemplate;
};