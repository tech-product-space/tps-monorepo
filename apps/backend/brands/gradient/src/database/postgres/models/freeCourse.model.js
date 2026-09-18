import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
  const FreeCourse = sequelize.define(
    "FreeCourse",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      title: DataTypes.STRING,
      subTitle: DataTypes.STRING,

      description: DataTypes.TEXT,

      author: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      curriculum: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      whatYouWillLearn: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      whoShouldAttend: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      certificate: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      rightCard: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },

      thumbnail: DataTypes.STRING,

      seo: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      isPublished: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      slug: {
        type: DataTypes.STRING,
        unique: true,
      },

      faq: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },

      /**
       * Per-course switches. Read only through `resolveFreeCourseSettings()` —
       * every row created before a key existed stores `{}`, so a direct read of
       * a default-on switch yields undefined and behaves as off.
       */
      settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "FreeCourses",
      timestamps: true,
      hooks: {
        beforeValidate: (course) => {
          if (course.title && !course.slug) {
            course.slug = course.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
          }
        },
      },
    }
  );

  FreeCourse.associate = (models) => {
    FreeCourse.hasMany(models.FreeCourseModule, {
      foreignKey: "freeCourseId",
      as: "modules",
    });

    FreeCourse.hasOne(models.FreeCourseCertificateTemplate, {
      foreignKey: "freeCourseId",
      as: "certificateTemplate",
    });

    FreeCourse.hasMany(models.FreeCourseEmailTemplate, {
      foreignKey: "freeCourseId",
      as: "emailTemplates",
    });
  };

  return FreeCourse;
};