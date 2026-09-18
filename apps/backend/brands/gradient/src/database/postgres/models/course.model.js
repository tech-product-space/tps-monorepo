import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import {
  DEFAULT_COURSE_PRICING,
  DEFAULT_COURSE_SETTINGS,
} from "../../../config/constants/course.js";

/**
 * A paid program. Holds only the commercial layer — the marketing page for each
 * course is hand-built in the website repo and reads `pricing` from here.
 */
export default (sequelize) => {
  const Course = sequelize.define(
    "Course",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      /** Matches the public route, e.g. "data-analytics". Never changed after
       *  creation — the live URL and every lead's `source` key off it. */
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      /** Display name, e.g. "Data Analytics Program". */
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      pricing: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: DEFAULT_COURSE_PRICING,
      },

      /** { fileKey, fileName, uploadedAt } — S3 key of the current brochure. */
      brochure: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: DEFAULT_COURSE_SETTINGS,
      },

      isPublished: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "Courses",
      timestamps: true,
    },
  );

  Course.associate = (models) => {
    Course.hasMany(models.CourseEmailTemplate, {
      foreignKey: "courseId",
      as: "emailTemplates",
    });
  };

  return Course;
};
