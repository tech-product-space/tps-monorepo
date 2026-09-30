import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import {
  FREE_COURSE_CERTIFICATE_ISSUED_VIA,
  FREE_COURSE_CERTIFICATE_STATUS,
} from "../../../config/constants/freeCourseCertificate.js";
import { emitFreeCourseCertificateIssued } from "../../../services/leadEvent/emitters.js";

export default (sequelize) => {
  const FreeCourseCertificate = sequelize.define(
    "FreeCourseCertificate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      freeCourseId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // Ownership. Unlike event certificates — which are keyed on email because
      // a teammate earns one before they have an account — there is no
      // account-less path into a free course, so this is never null.
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      enrolmentId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      certificateNo: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      recipientName: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      recipientEmail: {
        type: DataTypes.STRING,
        allowNull: false,
        // Frozen copy used for sending, not the identity key — but still
        // normalised on the way in so a lookup by address cannot miss.
        set(value) {
          this.setDataValue(
            "recipientEmail",
            typeof value === "string" ? value.trim().toLowerCase() : value,
          );
        },
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: FREE_COURSE_CERTIFICATE_STATUS.PENDING,
        validate: {
          isIn: [Object.values(FREE_COURSE_CERTIFICATE_STATUS)],
        },
      },

      issuedVia: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [Object.values(FREE_COURSE_CERTIFICATE_ISSUED_VIA)],
        },
      },

      issuedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      templateSnapshot: {
        type: DataTypes.JSONB,
        allowNull: true,
      },

      // S3 key of the PDF. Never store a URL here — the object is private and
      // the download route streams its bytes.
      fileKey: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Published lesson count at the moment it was earned. The course can grow
      // afterwards without invalidating this certificate; the number is what
      // lets the admin table explain the difference.
      lessonsAtIssue: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      issuedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      emailSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      revokedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      revokeReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      replacesCertificateId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "FreeCourseCertificates",
      timestamps: true,
      /**
       * Lead-event emitter, on the transition to Issued rather than on create.
       *
       * A certificate row exists from the moment someone is eligible — Approved,
       * then Issuing — and only means "they earned a certificate" once the PDF
       * is in S3. Emitting on create would put the event on the timeline for
       * rows that later fail to render.
       *
       * The dedupe key is the row id, so a retry that moves Failed -> Approved
       * -> Issued a second time still records exactly one event.
       */
      hooks: {
        afterCreate: (row, options) => {
          if (row.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED) {
            emitFreeCourseCertificateIssued(row, options);
          }
        },
        afterUpdate: (row, options) => {
          if (
            row.status === FREE_COURSE_CERTIFICATE_STATUS.ISSUED &&
            row.previous("status") !== FREE_COURSE_CERTIFICATE_STATUS.ISSUED
          ) {
            emitFreeCourseCertificateIssued(row, options);
          }
        },
      },
    },
  );

  FreeCourseCertificate.associate = (models) => {
    FreeCourseCertificate.belongsTo(models.FreeCourse, {
      foreignKey: "freeCourseId",
      as: "course",
    });

    FreeCourseCertificate.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });

    FreeCourseCertificate.belongsTo(models.FreeCourseEnrollment, {
      foreignKey: "enrolmentId",
      as: "enrolment",
    });

    FreeCourseCertificate.belongsTo(models.AdminUser, {
      foreignKey: "issuedBy",
      as: "issuedAdmin",
    });

    FreeCourseCertificate.belongsTo(models.AdminUser, {
      foreignKey: "revokedBy",
      as: "revokedAdmin",
    });

    FreeCourseCertificate.belongsTo(models.FreeCourseCertificate, {
      foreignKey: "replacesCertificateId",
      as: "replaces",
    });
  };

  return FreeCourseCertificate;
};
