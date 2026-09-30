"use strict";
const { Model } = require("sequelize");
const { PAYMENT_STATUS, PAYMENT_PURPOSE } = require("../config/constants/payment");

module.exports = (sequelize, DataTypes) => {
  class Payment extends Model {
    static associate(models) {
      Payment.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "Creator",
      });

      Payment.belongsTo(models.LeadProfile, {
        foreignKey: "lead_profile_id",
        as: "LeadProfile",
      });

      Payment.hasOne(models.PaymentLink, {
        foreignKey: "payment_id",
        as: "Link",
      });

      Payment.belongsTo(models.LeadCourse, {
        foreignKey: "lead_course_id",
        as: "LeadCourse",
      });

      Payment.belongsTo(models.User, {
        foreignKey: "verified_by",
        as: "Verifier",
      });

      Payment.hasMany(models.PaymentAttachment, {
        foreignKey: "payment_id",
        as: "Attachments",
      });

      // The rejected payment this row was recorded to replace.
      Payment.belongsTo(models.Payment, {
        foreignKey: "supersedes_payment_id",
        as: "Supersedes",
      });
    }
  }

  Payment.init(
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

      // Presentment amount — what the customer was charged, in `currency`.
      // DECIMAL is returned as a string by pg; the getter normalizes to Number
      // so every reader (aggregations + JSON responses) sees a number.
      amount: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        get() {
          const v = this.getDataValue("amount");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "INR",
      },

      // Settlement amount in the account's base currency (INR), reported by the
      // gateway webhook. For domestic INR payments base_amount === amount.
      // All revenue reporting sums base_amount across currencies.
      base_amount: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: true,
        defaultValue: null,
        get() {
          const v = this.getDataValue("base_amount");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      base_currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "INR",
      },

      fee_type: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
      },

      fees: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        get() {
          const v = this.getDataValue("fees");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      tax: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        get() {
          const v = this.getDataValue("tax");
          return v === null || v === undefined ? v : Number(v);
        },
      },

      description: {
        type: DataTypes.STRING,
      },

      // Source of a manually-recorded payment: bank_transfer | razorpay | cashfree.
      source: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
      },

      // External transaction reference (bank UTR / Razorpay / Cashfree txn id).
      reference: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },

      // Free-text internal note about the payment.
      note: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },

      status: {
        type: DataTypes.ENUM(
          PAYMENT_STATUS.PENDING,
          PAYMENT_STATUS.PAID,
          PAYMENT_STATUS.FAILED,
          PAYMENT_STATUS.CANCELLED,
          PAYMENT_STATUS.EXPIRED,
        ),
        defaultValue: PAYMENT_STATUS.PENDING,
      },

      paid_at: {
        type: DataTypes.DATE,
      },

      lead_course_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      expire_by: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },

      // Approval state of a manually-recorded payment. NULL for gateway
      // payments and pre-feature rows. See VERIFICATION_STATUS for how this
      // pairs with `status` — unverified money is never status='paid'.
      verification_status: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
      },

      verified_by: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
      },

      // When the payment was approved OR rejected (not when it was received —
      // that stays in paid_at, which drives revenue attribution).
      verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },

      rejection_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
      },

      // Cohort this money was received under, snapshotted at creation.
      //
      // Cohort revenue reads THIS, not lead_courses.cohort_id — otherwise
      // deferring one student retroactively moves every rupee they ever paid
      // into their new batch and a closed month changes after the fact. Frozen
      // once the payment is paid; still-pending rows are re-stamped on a
      // deferral, because unrecognised money follows the student.
      cohort_id: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
      },

      cohort_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
        defaultValue: null,
      },

      // Which ledger this money belongs to — see PAYMENT_PURPOSE.
      //
      // A deferral fee is not part of the course fee, so it is capped, reported
      // and credited separately. Distinct from `description` (customer-facing,
      // free text) and `source` (how the money arrived).
      purpose: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: PAYMENT_PURPOSE.COURSE_FEE,
      },

      // Set when this row was recorded to correct an earlier rejected one.
      supersedes_payment_id: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      sequelize,
      modelName: "Payment",
      tableName: "payments",
      underscored: true,
    },
  );

  return Payment;
};
