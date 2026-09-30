'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Invoice extends Model {
    static associate(models) {
      Invoice.belongsTo(models.LeadCourse, {
        foreignKey: 'lead_course_id',
        as: 'LeadCourse',
      });
      Invoice.belongsTo(models.User, {
        foreignKey: 'generated_by',
        as: 'GeneratedBy',
      });
    }
  }

  Invoice.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      invoice_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
      },

      financial_year: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },

      lead_course_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      generated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      // 'profile' = billed to the lead's own profile; 'custom' = billed to a
      // different entity (e.g. the lead's employer) whose details are frozen below.
      buyer_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'profile',
      },

      buyer_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },

      buyer_email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },

      buyer_gstin: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },

      // Contact person (e.g. the lead) shown alongside a custom business buyer.
      buyer_contact_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },

      buyer_address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      buyer_phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },

      // Batch this invoice was issued against, snapshotted at issue time like
      // every buyer_* field above. Read instead of the enrollment's live cohort
      // so a later deferral cannot rewrite what an already-issued document says.
      cohort_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },

      total_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      taxable_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      gst_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'Invoice',
      tableName: 'invoices',
      underscored: true,
    },
  );

  return Invoice;
};
