"use strict";

const { ulid } = require("ulid");
const { RECORDING_FORMATS } = require("../constants/recording");

/**
 * A session recording — the gated YouTube library at /recordings.
 *
 * Full design in `../../RECORDINGS_PLAN.md`. Three things about it are easy to
 * get wrong from elsewhere:
 *
 * - **`video.url` is not public while `settings.gateVideo` is on.** The public
 *   controller strips it. A YouTube link is not a secret and we are not
 *   pretending otherwise, but shipping it in the page payload and merely hiding
 *   the iframe would make the gate decorative — and the conversion number the
 *   feature is measured on fiction.
 * - **`settings` is never read off the model.** Go through
 *   `resolveRecordingSettings()`, which layers the defaults underneath.
 * - **`content` is the growth area.** New prose blocks go in there as keys, not
 *   as columns. `RECORDING_CONTENT_KEYS` is the contract.
 */
module.exports = (sequelize, DataTypes) => {
  const Recording = sequelize.define(
    "Recording",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      /** Public URL `/recordings/<slug>`. Treat as immutable after publish. */
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** The single line under the title on the detail page. */
      subtitle: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      categoryId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * One image for both pages: the listing tile and the detail page's
       * pre-play frame. Stored **without** the title, which the UI renders over
       * it — baked in, a copy fix becomes a re-export and the title stops being
       * selectable, searchable and responsive.
       *
       * Never fall back to YouTube's own thumbnail: the gated state has to
       * render before we admit which video it is.
       */
      thumbnail: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * `{ provider, url, videoId, isUnlisted }`.
       *
       * `videoId` is parsed from `url` on save so the player never re-parses,
       * and because the YouTube IFrame API is constructed with a bare id.
       */
      video: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /** Total runtime in minutes. Stored — we do not call the YouTube API. */
      durationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      /** `{ name, avatar, linkedinUrl }` — the "HOSTED BY" chip. */
      host: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      /**
       * The "YOU'LL LEARN FROM" block, including each speaker's "PREVIOUSLY AT"
       * logos. An array even though the design shows one — `speakers[0]` also
       * feeds the listing card's name and `title @ company` line.
       */
      speakers: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },

      /**
       * The detail page's prose blocks, keyed by `RECORDING_CONTENT_KEYS`.
       * One column so the next block added is a form change and nothing more.
       */
      content: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /**
       * The "KEEP EXPLORING" cards, picked by hand. Empty auto-fills from the
       * same category, newest first.
       *
       * No FK — a deleted recording is filtered out at read time rather than
       * cascading edits into every row that happened to reference it.
       */
      relatedRecordingIds: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },

      /**
       * The "2,987 Attendees" social proof. Admin-entered, like
       * `events.numberOfAttendees` — it is the live session's attendance, which
       * we do not hold, not a count of anything in this database.
       */
      attendeeCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      /** Gate passes since publish. Internal metric. */
      viewCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /** `{ title, description, ogImage, keywords[] }`. */
      seo: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      /** Read only through `resolveRecordingSettings()`. */
      settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /**
       * The badge on the card — "Workshop", "Hackathon", "Teardown".
       *
       * Validated against the same list `events.eventType` uses, so the two
       * cannot disagree about what a session can be. A plain string rather than
       * an ENUM: adding a fourth kind should not need a migration.
       */
      format: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [[...RECORDING_FORMATS]],
        },
      },

      isPublished: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      /**
       * The grid's sort key. Set on first publish — not the same as
       * `createdAt`, because a backfilled recording is older than its row.
       */
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "Recordings",
      timestamps: true,
      hooks: {
        beforeValidate: (recording) => {
          if (recording.title && !recording.slug) {
            recording.slug = recording.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
          }
        },
      },
    }
  );

  Recording.associate = (models) => {
    Recording.belongsTo(models.RecordingCategory, {
      foreignKey: "categoryId",
      as: "category",
    });

    Recording.hasMany(models.RecordingLead, {
      foreignKey: "recordingId",
      as: "leads",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Recording;
};
