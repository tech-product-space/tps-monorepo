"use strict";
const { Model } = require("sequelize");
const { ENROLLMENT_STATUS } = require("../config/constants/enrollment");

module.exports = (sequelize, DataTypes) => {
  class LeadCourse extends Model {
    static associate(models) {
      LeadCourse.belongsTo(models.LeadProfile, {
        foreignKey: "lead_profile_id",
        as: "LeadProfile",
      });

      LeadCourse.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "Creator",
      });

      // Snapshot of the lead owner at enroll time (NULL = unassigned/other).
      // Drives the enrollment list scope/owner column and dashboard credit,
      // independent of later lead reassignment.
      LeadCourse.belongsTo(models.User, {
        foreignKey: "owner_agent_id",
        as: "Owner",
      });

      LeadCourse.hasMany(models.Payment, {
        foreignKey: "lead_course_id",
        as: "Payments",
      });

      LeadCourse.belongsTo(models.Cohort, {
        foreignKey: "cohort_id",
        as: "Cohort",
      });

      // The batch the student was originally sold into. Frozen on the first
      // deferral; `Cohort` above is where they are now. Cohort revenue reads
      // one of the two depending on whether the figure is backward-looking
      // (collected, seats sold) or forward-looking (upcoming, running now).
      LeadCourse.belongsTo(models.Cohort, {
        foreignKey: "original_cohort_id",
        as: "OriginalCohort",
      });

      LeadCourse.hasMany(models.EnrollmentCohortChange, {
        foreignKey: "lead_course_id",
        as: "CohortChanges",
      });

      LeadCourse.hasOne(models.Invoice, {
        foreignKey: "lead_course_id",
        as: "Invoice",
      });

      // Whoever dropped the enrollment (Superadmin/ProgramManager only).
      // NULL on every active enrollment.
      LeadCourse.belongsTo(models.User, {
        foreignKey: "dropped_by",
        as: "DroppedBy",
      });
    }
  }

  LeadCourse.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      lead_profile_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      // Lead owner snapshotted at enroll time. NULL when no Agent/Manager
      // owned a lead on the profile then, or the owner was later removed.
      owner_agent_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      course_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },

      program_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },

      // Currency this enrollment is priced in. Every payment on it inherits
      // this; due/paid math stays single-currency.
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "INR",
      },

      // Money columns are DECIMAL (pg returns strings); getters normalize to
      // Number so aggregations and JSON responses stay numeric.
      course_price: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        get() {
          const v = this.getDataValue("course_price");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      platform_discount_percent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      agent_discount_amount: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("agent_discount_amount");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      gst_amount: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("gst_amount");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      // Whether course_price already includes GST. When true, gst_amount is
      // backed out of final_fee instead of added on top. Snapshotted at enroll
      // time so later edits recompute with the mode the enrollment was sold
      // under, and so pre-existing rows (false) keep their exclusive math.
      gst_inclusive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      final_fee: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        get() {
          const v = this.getDataValue("final_fee");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      // Chosen cohort/batch (FK to cohorts).
      cohort_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      // Snapshot of the cohort name at enroll time.
      cohort_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },

      // Lifecycle state — see config/constants/enrollment.js.
      //
      // Only two values. A re-enrollment is also 'active'; it is distinguished
      // by is_reenrollment below, not by a third status. A partial unique index
      // (lead_profile_id, course_id) WHERE status='active' guarantees at most
      // one live enrollment per student per course, while permitting any number
      // of dropped ones — which is what makes re-enrollment possible without
      // allowing genuine duplicates.
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: ENROLLMENT_STATUS.ACTIVE,
      },

      // Effective date the student left. Back-datable, so a drop recorded in
      // August for someone who left in July stops counting from July.
      dropped_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      dropped_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      // Free text, required when dropping. No controlled vocabulary by design.
      drop_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },

      // Has this enrollment ever been moved to a later batch?
      //
      // A FLAG, not a status. `status` stays 'active' for a deferred student —
      // they are still enrolled and still owe money, so they must keep matching
      // every `status = 'active'` filter (the partial unique index,
      // validatePaymentTarget, the pipeline query, deleteCohort's usage count).
      // The UI derives a "Deferred" badge from this, the same way a
      // re-enrollment is derived from is_reenrollment rather than a status.
      is_deferred: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      // Effective date of the LATEST move. Back-datable within
      // [enrolled_at, now], same bounds as dropped_at.
      deferred_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      deferral_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      // The batch this enrollment was SOLD into. Set on the first deferral from
      // whatever cohort_id then held, and never touched again — so "Cohort 4
      // sold 30 seats" stays true however many of them later moved out.
      original_cohort_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      original_cohort_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },

      // Rescheduling fees charged on this enrollment, cumulative.
      //
      // A SECOND LEDGER, deliberately never added into final_fee: the fee has
      // nothing to do with the price the student enrolled at, and final_fee is
      // what an issued invoice's tax breakdown reconciles to. Payments against
      // it carry purpose='deferral_fee' and are capped against this figure
      // rather than the course fee.
      deferral_fee_total: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("deferral_fee_total");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      // A returning student's enrollment. Set once at creation, never changed.
      //
      // Read by the revenue and conversion aggregates: a re-enrollment is
      // company revenue but earns the owning agent NOTHING — winning back a
      // student who already bought is not a new sale. The agent still owns and
      // collects on it; they just do not get credited for it.
      is_reenrollment: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: "LeadCourse",
      tableName: "lead_courses",
      underscored: true,
    },
  );

  return LeadCourse;
};
