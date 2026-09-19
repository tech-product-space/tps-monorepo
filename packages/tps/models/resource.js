"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Resource extends Model {
    static associate(models) {
      // One Resource → Many Leads
      Resource.hasMany(models.ResourceLead, {
        foreignKey: "resourceId",
        as: "leads",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  }

  Resource.init(
    {
      resourceCategory: DataTypes.STRING,
      resourceType: DataTypes.STRING,
      subtitle: DataTypes.STRING,
      thumbnail: DataTypes.STRING,
      title: DataTypes.STRING,
      tagPrimary: DataTypes.ARRAY(DataTypes.STRING),
      tagSecondary: DataTypes.ARRAY(DataTypes.STRING),
      resourceDetails: DataTypes.JSONB,
      emailTemplate: DataTypes.JSONB,
      resourceSlug: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      additionalDetails: DataTypes.JSONB,
      isPublished: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: "Resource",
      tableName: "Resources",
    }
  );

  return Resource;
};
