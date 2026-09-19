"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class PaymentAttachment extends Model {
    static associate(models) {
      PaymentAttachment.belongsTo(models.Payment, {
        foreignKey: "payment_id",
        as: "Payment",
      });

      PaymentAttachment.belongsTo(models.User, {
        foreignKey: "uploaded_by",
        as: "Uploader",
      });
    }
  }

  PaymentAttachment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      payment_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      // S3 object key only — never a URL. Reads go through a short-lived
      // presigned URL because proof screenshots carry bank details.
      file_key: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },

      file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },

      mime_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },

      size_bytes: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      uploaded_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "PaymentAttachment",
      tableName: "payment_attachments",
      underscored: true,
    },
  );

  return PaymentAttachment;
};
