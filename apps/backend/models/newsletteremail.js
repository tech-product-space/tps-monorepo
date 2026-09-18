'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NewsletterEmail extends Model {
    static associate(models) {
      // no associations yet, can add later if needed
    }
  }

  NewsletterEmail.init(
    {
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      status: {
        type: DataTypes.ENUM('subscribed', 'unsubscribed'),
        defaultValue: 'subscribed',
      },
    },
    {
      sequelize,
      modelName: 'NewsletterEmail',
      tableName: 'NewsletterEmails',
    }
  );

  return NewsletterEmail;
};
