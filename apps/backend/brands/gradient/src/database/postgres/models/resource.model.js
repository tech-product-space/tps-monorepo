import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
  const Resource = sequelize.define(
    "Resource",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      resourceType: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      subtitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      thumbnailSrc: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      resourceCategory: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      tagPrimary: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },

      tagSecondary: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },

      resourceContent: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      resourceDetails: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      emailTemplate: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      resourceSlug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      authorDetails: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      seo: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      additionalDetails: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      isPublished: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "Resources",
      timestamps: true,
    },
  );

  return Resource;
};
