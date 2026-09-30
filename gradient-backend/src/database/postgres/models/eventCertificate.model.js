import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import {
  EVENT_CERTIFICATE_APPROVED_VIA,
  EVENT_CERTIFICATE_SOURCE,
  EVENT_CERTIFICATE_STATUS,
} from "../../../config/constants/eventCertificate.js";
import { emitCertificateIssued } from "../../../services/leadEvent/emitters.js";

export default (sequelize) => {
  const EventCertificate = sequelize.define(
    "EventCertificate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      eventId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // Nullable — see the migration. A certificate belongs to a person, not to
      // a registration.
      guestId: {
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
        // Half of the uniqueness key, so normalise on the way in rather than
        // trusting every call site to remember.
        set(value) {
          this.setDataValue(
            "recipientEmail",
            typeof value === "string" ? value.trim().toLowerCase() : value,
          );
        },
      },

      source: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(EVENT_CERTIFICATE_SOURCE)],
        },
      },

      sourceFeedbackId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: EVENT_CERTIFICATE_STATUS.PENDING,
        validate: {
          isIn: [Object.values(EVENT_CERTIFICATE_STATUS)],
        },
      },

      templateSnapshot: {
        type: DataTypes.JSONB,
        allowNull: true,
      },

      // S3 key of the PDF. Never store a URL here — the object is private and
      // URLs are presigned per request.
      fileKey: {
        type: DataTypes.STRING,
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

      approvedVia: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [Object.values(EVENT_CERTIFICATE_APPROVED_VIA)],
        },
      },

      approvedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      approvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      replacesCertificateId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "EventCertificates",
      timestamps: true,
      /**
       * Lead-event emitter, on the transition to Issued rather than on create.
       *
       * A certificate row exists from the moment a recipient is identified —
       * Pending, then Approved, then Issuing — and only means "they earned a
       * certificate" once the PDF is in S3. Emitting on create would put the
       * event on the timeline for rows that later fail to render.
       *
       * The dedupe key is the row id, so a retry that moves Failed -> Approved
       * -> Issued a second time still records exactly one event.
       */
      hooks: {
        afterCreate: (row, options) => {
          if (row.status === EVENT_CERTIFICATE_STATUS.ISSUED) {
            emitCertificateIssued(row, options);
          }
        },
        afterUpdate: (row, options) => {
          if (
            row.status === EVENT_CERTIFICATE_STATUS.ISSUED &&
            row.previous("status") !== EVENT_CERTIFICATE_STATUS.ISSUED
          ) {
            emitCertificateIssued(row, options);
          }
        },
      },
    },
  );

  EventCertificate.associate = (models) => {
    EventCertificate.belongsTo(models.Event, {
      foreignKey: "eventId",
      as: "event",
    });

    EventCertificate.belongsTo(models.EventGuest, {
      foreignKey: "guestId",
      as: "guest",
    });

    EventCertificate.belongsTo(models.EventFeedback, {
      foreignKey: "sourceFeedbackId",
      as: "sourceFeedback",
    });

    EventCertificate.belongsTo(models.AdminUser, {
      foreignKey: "approvedBy",
      as: "approvedAdmin",
    });

    EventCertificate.belongsTo(models.EventCertificate, {
      foreignKey: "replacesCertificateId",
      as: "replaces",
    });
  };

  return EventCertificate;
};
