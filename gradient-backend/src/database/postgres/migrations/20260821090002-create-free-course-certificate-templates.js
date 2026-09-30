"use strict";

/**
 * The certificate design for a free course. One per course.
 *
 * Same shape as EventCertificateTemplates, with two deliberate differences:
 *
 *   - `orientation` is NOT NULL here. It is nullable on the event table only
 *     because templates predate the column and had to be backfilled by guessing
 *     from the canvas shape. There is no such history here, so the renderer's
 *     guess-from-aspect-ratio path is a fallback this table never needs to use.
 *
 *   - `freeCourseId` is unique rather than merely indexed, which is what "one
 *     design per course" actually means. The event table leaves it to
 *     `findOrCreate` in the controller, and a race there mints a second
 *     template that nothing ever reads.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("FreeCourseCertificateTemplates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      freeCourseId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        references: {
          model: "FreeCourses",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // S3 key. Never a URL — render it with resolveStorageUrl(key).
      backgroundKey: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      canvasWidth: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      canvasHeight: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // "landscape" | "portrait" — decides the printed page size, not the
      // artwork. The page always keeps the background's aspect ratio.
      orientation: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // x/y are percentages of the canvas, not pixels — that is what lets the
      // admin editor position on a scaled preview and still match the render.
      fields: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      createdBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      updatedBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("FreeCourseCertificateTemplates");
  },
};
