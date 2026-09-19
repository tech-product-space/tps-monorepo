import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
  const Blog = sequelize.define(
    "Blog",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      subTitle: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },

      authorDetails: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          name: "",
          designation: "",
          company: "",
          imgSrc: "",
          imgAlt: "",
        },
      },

      publishedDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      category: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      tableOfContents: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      content: {
        type: DataTypes.JSONB,
        allowNull: false,
      },

      tags: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      readTime: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      thumbnailSrc: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },

      thumbnailAlt: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "draft",
      },

      url: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      isFeatured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      faq: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      // Optional per-blog active-recall quiz, authored in the admin editor and
      // scored client-side on the public site (no login, no attempt tracking).
      quiz: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: { enabled: false, questions: [] },
      },

      seo: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      tableName: "blogs",
      timestamps: true,
    },
  );

  return Blog;
};
