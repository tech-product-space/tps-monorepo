"use strict";
const { Model } = require("sequelize");

/**
 * One recorded move of an enrollment from one cohort to another.
 *
 * lead_courses carries only the two endpoints — where the student started
 * (original_cohort_*) and where they are now (cohort_*). Every hop between them
 * lives here, which is what makes a twice-deferred student reconstructable:
 * who moved them, when it took effect, why, and what it cost.
 *
 * Cohort names are stored beside their ids because both FKs are ON DELETE SET
 * NULL — a cohort that is later removed must not blank out the history.
 */
module.exports = (sequelize, DataTypes) => {
  class EnrollmentCohortChange extends Model {
    static associate(models) {
      EnrollmentCohortChange.belongsTo(models.LeadCourse, {
        foreignKey: "lead_course_id",
        as: "LeadCourse",
      });

      EnrollmentCohortChange.belongsTo(models.Cohort, {
        foreignKey: "from_cohort_id",
        as: "FromCohort",
      });

      EnrollmentCohortChange.belongsTo(models.Cohort, {
        foreignKey: "to_cohort_id",
        as: "ToCohort",
      });

      // The fee payment this move produced, when one was collected at the time.
      EnrollmentCohortChange.belongsTo(models.Payment, {
        foreignKey: "deferral_payment_id",
        as: "DeferralPayment",
      });

      EnrollmentCohortChange.belongsTo(models.User, {
        foreignKey: "changed_by",
        as: "ChangedBy",
      });
    }
  }

  EnrollmentCohortChange.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      lead_course_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      // Null when the enrollment had no cohort before the move.
      from_cohort_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      from_cohort_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },

      to_cohort_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      to_cohort_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },

      reason: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },

      effective_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      deferral_fee_amount: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("deferral_fee_amount");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      // NULL when no fee was charged, or when the fee was added to the balance
      // without being collected at the same time.
      deferral_payment_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      changed_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "EnrollmentCohortChange",
      tableName: "enrollment_cohort_changes",
      underscored: true,
    },
  );

  return EnrollmentCohortChange;
};
