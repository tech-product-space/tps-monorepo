"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventCertificates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      eventId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "Events",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // NULLABLE on purpose. A certificate is addressed to a name+email, not to
      // a registration — a teammate named in someone else's submission earns one
      // whether or not they ever registered. Backfilled if they register later.
      guestId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "EventGuests",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      certificateNo: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      // Frozen at approval. A later profile edit must not change what an
      // already-issued certificate says.
      recipientName: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // Always stored lowercased — it is half of the uniqueness key.
      recipientEmail: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // Attendee | Teammate
      source: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      sourceFeedbackId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "EventFeedbacks",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      // Pending | Approved | Issuing | Issued | Failed | Revoked
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "Pending",
      },

      templateSnapshot: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      // S3 key of the PDF. Never a URL — the object is private and every URL is
      // presigned on demand, so a stored one would be dead within the hour.
      fileKey: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // Separate from issuedAt so a failed email retries without re-rendering.
      issuedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      emailSentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      lastError: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // Auto (feedback submit) | Admin | Correction
      approvedVia: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      approvedBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      approvedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // Set when this row supersedes one revoked for a typo'd recipient.
      replacesCertificateId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // Keyed on EMAIL, not guestId. Postgres treats NULLs as distinct, so a
    // guest-keyed constraint would let every unregistered teammate through
    // repeatedly. Email-keyed also dedupes for free when two people name the
    // same teammate, and is what makes auto-issue and manual issue safe to run
    // in either order.
    await queryInterface.addConstraint("EventCertificates", {
      fields: ["eventId", "recipientEmail"],
      type: "unique",
      name: "event_certificates_event_id_recipient_email_unique",
    });

    await queryInterface.addIndex("EventCertificates", ["eventId", "status"], {
      name: "event_certificates_event_id_status_idx",
    });

    // Backs GET /public/mine, which matches on guestId OR the signed-in user's
    // email so certificates issued before an account existed still find them.
    await queryInterface.addIndex("EventCertificates", ["recipientEmail"], {
      name: "event_certificates_recipient_email_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("EventCertificates");
  },
};
