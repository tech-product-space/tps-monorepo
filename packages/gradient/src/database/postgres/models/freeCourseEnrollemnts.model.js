import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import { emitFreeCourseEnrolled } from "../../../services/leadEvent/emitters.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";

export default (sequelize) => {
  const FreeCourseEnrollment = sequelize.define(
    "FreeCourseEnrollment",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      userId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      courseId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      formData: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      tableName: "FreeCourseEnrollments",
      timestamps: true,
      /**
       * Lead-event emitter. Fires here rather than in the controllers because
       * this row has more than one create path, and a trigger that silently
       * stops firing for one of them reads as "quiet", not as a bug.
       * Deferred to after-commit inside the emitter, so a rolled-back write
       * records nothing. See `services/leadEvent/`.
       */
      hooks: {
        afterCreate: (row, options) => {
          emitFreeCourseEnrolled(row, options);
          emitTriggerEvent("freeCourseEnrolments", row, options);
        },
      },
    }
  );

  FreeCourseEnrollment.associate = (models) => {
    FreeCourseEnrollment.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });

    FreeCourseEnrollment.belongsTo(models.FreeCourse, {
      foreignKey: "courseId",
      as: "course",
    });
  };

  return FreeCourseEnrollment;
};