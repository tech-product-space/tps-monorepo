"use strict";

/**
 * Session recordings — the gated YouTube library at /recordings.
 *
 * A table of its own rather than `Resources` with `resourceType: "recording"`.
 * A recording needs ten fields no resource has, the listing page sorts and
 * filters on three of them, and burying those in `resourceContent` turns every
 * list query into a JSONB path lookup. The cost is that a future
 * "search everything" surface has to query both tables; that surface does not
 * exist today.
 *
 * Three foreign keys, all nullable, all SET NULL. None of them is allowed to
 * take a recording down with it:
 *
 * - `categoryId` — losing a shelf label must not delete what is on the shelf.
 * - `relatedCourseId` — deleting a course drops the cross-sell card, nothing more.
 * - `eventId` — provenance only. Every field the page renders is stored here,
 *   so a recording whose source event is gone still displays correctly.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Recordings", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subtitle: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      categoryId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "RecordingCategories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      format: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // One image for both pages — the listing tile and the detail page's
      // pre-play frame. Stored without the title, which the UI renders over it.
      thumbnail: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      video: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      durationMinutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      host: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      speakers: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      // The detail page's prose blocks. One column so a new block is a form
      // change rather than a migration — see RECORDING_CONTENT_KEYS.
      content: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      relatedCourseId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "Courses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      // Deliberately not a join table and not FK-constrained: these are three
      // editorial picks, and a deleted recording should be filtered out at read
      // time rather than trigger writes into every row that referenced it.
      relatedRecordingIds: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: [],
      },

      attendeeCount: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      viewCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      emailTemplate: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      seo: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      eventId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "Events", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      // The grid's sort key. Not createdAt — a backfilled recording is older
      // than its row, and sorting on import time would bury the whole backfill
      // under one date.
      publishedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // The unfiltered grid.
    await queryInterface.addIndex("Recordings", ["isPublished", "publishedAt"], {
      name: "recordings_published_at",
    });

    // The chip-filtered grid.
    await queryInterface.addIndex(
      "Recordings",
      ["categoryId", "isPublished", "publishedAt"],
      { name: "recordings_category_published_at" },
    );

    await queryInterface.addIndex("Recordings", ["eventId"], {
      name: "recordings_event_id",
    });

    await queryInterface.addIndex("Recordings", ["relatedCourseId"], {
      name: "recordings_related_course_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Recordings");
  },
};
