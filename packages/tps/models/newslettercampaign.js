'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NewsletterCampaign extends Model {
    static associate(models) {
      // no associations
    }
  }

  NewsletterCampaign.init(
    {
      subject: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      senderEmail: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      senderName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // 'all' | 'date' | 'selected'
      audienceType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      audienceFrom: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      audienceTo: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      totalRecipients: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      sentCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      failedCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      // 'sent' | 'partial' | 'failed'
      status: {
        type: DataTypes.STRING,
        defaultValue: 'sent',
      },
    },
    {
      sequelize,
      modelName: 'NewsletterCampaign',
      tableName: 'NewsletterCampaigns',
    }
  );

  return NewsletterCampaign;
};
