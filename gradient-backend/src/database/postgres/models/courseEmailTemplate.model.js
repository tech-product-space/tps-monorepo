import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import { COURSE_EMAIL_TYPE_LIST } from "../../../config/constants/course.js";

/**
 * One editable email per (course, type). Kept as rows rather than a JSONB blob
 * on Course so a new email type is a constant plus a card in admin, with no
 * migration and no risk of one save clobbering another template.
 */
export default (sequelize) => {
  const CourseEmailTemplate = sequelize.define(
    "CourseEmailTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      courseId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** One of COURSE_EMAIL_TYPES. */
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [COURSE_EMAIL_TYPE_LIST],
        },
      },

      subject: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      /** Lets an admin park a draft without it going out. */
      isEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "CourseEmailTemplates",
      timestamps: true,
    },
  );

  CourseEmailTemplate.associate = (models) => {
    CourseEmailTemplate.belongsTo(models.Course, {
      foreignKey: "courseId",
      as: "course",
    });
  };

  return CourseEmailTemplate;
};
