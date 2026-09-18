"use strict";

/**
 * Certificates earned by completing a free course.
 *
 * Mirrors EventCertificates rather than sharing it. That table carries hard
 * foreign keys to Events, EventGuests and EventFeedbacks and is read by the
 * campaign audience resolver, the lead-event emitters and the dashboard;
 * converting a shipped table with a live dedupe contract into a
 * subjectType/subjectId shape, to save one table, breaks a working feature in
 * order to build a new one.
 *
 * The one structural difference is identity. Event certificates are keyed on
 * EMAIL, because a teammate named in someone else's feedback earns one before
 * they have an account. There is no account-less path into a free course — you
 * cannot enrol without being signed in — so these are keyed on `userId`, and
 * `recipientEmail` is a frozen copy for sending, not the identity.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("FreeCourseCertificates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      freeCourseId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "FreeCourses",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // RESTRICT, not CASCADE. A certificate is the record that one was issued,
      // and deleting a user should not silently erase the evidence. If user
      // deletion ever needs to work it revokes first — an explicit decision at
      // that point rather than a surprise now.
      userId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      // Provenance only — which enrolment this came from, when there was one.
      // Progress is keyed on (userId, lessonId), not on enrolment, so somebody
      // whose enrolment row is missing has still demonstrably done the work.
      enrolmentId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "FreeCourseEnrollments",
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

      // Frozen at issue. A later profile edit must not change what an already
      // issued certificate says.
      recipientName: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // Frozen too, and always stored lowercased by a model setter.
      recipientEmail: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // Pending | Approved | Issuing | Issued | Failed | Revoked
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "Pending",
      },

      // Auto (last lesson completed) | Ensure (idempotent re-check) |
      // Admin (Generate) | Correction
      issuedVia: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // Null for Auto and Ensure — which is how the admin table tells an
      // automatic certificate from a hand-generated one.
      issuedBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      templateSnapshot: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      // S3 key of the PDF. Never a URL — the object is private and the download
      // route streams its bytes, so a stored URL would be both dead and a leak.
      fileKey: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      /**
       * How many published lessons the course had when this was earned.
       *
       * The course can grow afterwards. The certificate stays valid — revoking
       * one somebody already downloaded because the syllabus expanded is
       * indefensible — so this records what was actually true, which is what
       * lets the admin Learners tab show "issued at 12 of 15" instead of
       * looking like a bug.
       */
      lessonsAtIssue: {
        type: Sequelize.INTEGER,
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

      // Events revoke without recording why. Worth knowing six months later.
      revokedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      revokedBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      revokeReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // Set when this row supersedes one revoked for a typo'd name.
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

    /**
     * One LIVE certificate per person per course — revoked ones do not count.
     *
     * Partial from day one, deliberately. The event table shipped an
     * unconditional constraint and had to replace it later (see
     * 20260812130000-live-certificate-unique-index.js): `correctRecipient`
     * revokes the original and inserts a replacement, and with an unconditional
     * constraint the replacement collides with the row it just revoked — so
     * correcting a misspelled name, the commonest correction there is, 500'd.
     *
     * Raw SQL because `addIndex`'s `where` option does not reliably emit a
     * partial UNIQUE index, and this needs to be exact. Every create path leans
     * on it: `ignoreDuplicates` emits ON CONFLICT DO NOTHING with no conflict
     * target, so it still resolves against a partial index.
     */
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "free_course_certificates_live_unique"
        ON "FreeCourseCertificates" ("freeCourseId", "userId")
        WHERE "status" <> 'Revoked';
    `);

    // Backs the admin Learners tab, which filters by status within a course.
    await queryInterface.addIndex(
      "FreeCourseCertificates",
      ["freeCourseId", "status"],
      { name: "free_course_certificates_course_status_idx" },
    );

    // Backs the dashboard listing and the ownership check on download.
    await queryInterface.addIndex("FreeCourseCertificates", ["userId"], {
      name: "free_course_certificates_user_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("FreeCourseCertificates");
  },
};
