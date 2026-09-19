import { DataTypes } from "sequelize";
import { ulid } from "ulid";

import {
  PROJECT_LEVEL_LIST,
  PROJECT_SOURCE,
  PROJECT_SOURCE_LIST,
  PROJECT_STATUS,
  PROJECT_STATUS_LIST,
} from "../../../config/constants/project.js";

/**
 * A buildable mini project — a card in the hub, a downloadable starter link,
 * and a stepped guide.
 *
 * Full design in `../PROJECTS_PLAN.md`. Four things about it are easy to get
 * wrong from elsewhere:
 *
 * - **`status` and `isPublished` are different questions.** `status` is
 *   moderation ("is this ours to show at all"), `isPublished` is visibility
 *   ("have we chosen to show it"). Approving does not publish. A public read
 *   needs *both*, which is why `publishedScope()` below is the only place that
 *   pair is written.
 * - **`downloadUrl` is not public while the project is gated.** The public
 *   detail controller strips it; only the gate emits it. A GitHub link is not a
 *   secret and we are not pretending otherwise, but shipping it in the page
 *   payload and merely hiding the button would make the gate decorative — and
 *   the download number the section is measured on fiction.
 * - **`settings` is never read off the model.** Go through
 *   `resolveProjectSettings()`, which layers the defaults underneath.
 * - **There is no `content` column.** The guide is `ProjectSteps` rows. See the
 *   note at the foot of `config/constants/project.js`.
 */
export default (sequelize) => {
  const Project = sequelize.define(
    "Project",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      /** Public URL `/projects/<category>/<slug>`. Immutable after publish. */
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /**
       * The card paragraph. Plain text, not rich — it is a blurb in a
       * four-line box, and an editor here would let somebody put a heading in
       * it.
       */
      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      categoryId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * Difficulty badge. Nullable: a submitter may not set one, and a project
       * without a level is still publishable.
       */
      level: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [PROJECT_LEVEL_LIST],
        },
      },

      /**
       * `["Python", "HTML", "CSS"]` — an array rather than the comma string the
       * design shows. The UI joins it; a filter over it later is then free.
       */
      prerequisites: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },

      /** The "Skills to be Learned" chips. */
      skills: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },

      /**
       * The "Download Project" target — any absolute http(s) URL. We host
       * nothing.
       *
       * Required to publish, checked in `toggleProjectStatus`: a published
       * project with a null or malformed link looks fine in every list and is a
       * dead button in production.
       */
      downloadUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /** S3 key — the guide header and the OG image. The card has no image. */
      thumbnail: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * The "more like this" rail, picked by hand. Empty auto-fills from the
       * same category, newest first.
       *
       * No FK — a deleted project is filtered out at read time rather than
       * cascading edits into every row that happened to reference it.
       */
      relatedProjectIds: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },

      seo: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /** Read only through `resolveProjectSettings()`. */
      settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PROJECT_STATUS.APPROVED,
        validate: {
          isIn: [PROJECT_STATUS_LIST],
        },
      },

      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PROJECT_SOURCE.ADMIN,
        validate: {
          isIn: [PROJECT_SOURCE_LIST],
        },
      },

      /**
       * `{ name, email, phone, githubUrl, linkedinUrl, note }` — who sent this
       * in.
       *
       * Only ever populated on a `community` row; `{}` on admin rows rather
       * than null, so the shape is uniform for anything reading it.
       */
      submitter: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /**
       * A link to the submitter's **own** write-up — a README, a blog post, a
       * walkthrough video. Reference material for whoever authors the real
       * guide, not the guide itself: that is `ProjectSteps`.
       *
       * Never rendered to the public. It is a working note from one person to
       * another, and it points at a page we do not control.
       */
      submittedGuideUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /**
       * A denormalised admin id, and deliberately **no** `belongsTo(AdminUser)`
       * — the activity log made the same call for the same reason: a deleted
       * admin must not take the review history with them.
       */
      reviewedByAdminId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      rejectionReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /**
       * Gate passes since publish. **Internal metric, rendered nowhere.**
       *
       * The number the panel shows is `leadCount` — people, not clicks, counted
       * from `ProjectLeads` rows. This one carries the same repeat-visitor
       * inflation `Recording.viewCount` does. Do not surface it, and do not
       * derive anything from a `downloadCount - leadCount` subtraction.
       */
      downloadCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      isPublished: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      /**
       * The grid's sort key. Set on first publish — not the same as
       * `createdAt`, because a backfilled project is older than its row.
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
      tableName: "Projects",
      timestamps: true,
      hooks: {
        beforeValidate: (project) => {
          if (project.title && !project.slug) {
            project.slug = project.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
          }
        },
      },
    },
  );

  Project.associate = (models) => {
    Project.belongsTo(models.ProjectCategory, {
      foreignKey: "categoryId",
      as: "category",
    });

    Project.hasMany(models.ProjectLead, {
      foreignKey: "projectId",
      as: "leads",
    });

    Project.hasMany(models.ProjectStep, {
      foreignKey: "projectId",
      as: "steps",
    });

    Project.hasMany(models.ProjectEmailTemplate, {
      foreignKey: "projectId",
      as: "emailTemplates",
    });
  };

  return Project;
};
