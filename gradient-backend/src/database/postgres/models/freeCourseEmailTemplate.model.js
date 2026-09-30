import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import { FREE_COURSE_EMAIL_TYPE_LIST } from "../../../config/constants/freeCourse.js";

/**
 * One editable email per (free course, type). Kept as rows rather than a JSONB
 * blob on FreeCourse so a new email type is a constant plus a card in admin,
 * with no migration and no risk of one save clobbering another template.
 */
export default (sequelize) => {
  const FreeCourseEmailTemplate = sequelize.define(
    "FreeCourseEmailTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      freeCourseId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** One of FREE_COURSE_EMAIL_TYPES. */
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [FREE_COURSE_EMAIL_TYPE_LIST],
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
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "FreeCourseEmailTemplates",
      timestamps: true,
    },
  );

  FreeCourseEmailTemplate.associate = (models) => {
    FreeCourseEmailTemplate.belongsTo(models.FreeCourse, {
      foreignKey: "freeCourseId",
      as: "course",
    });
  };

  return FreeCourseEmailTemplate;
};
