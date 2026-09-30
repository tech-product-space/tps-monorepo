"use strict";

/**
 * Buildable mini projects — the hub at /projects.
 *
 * One table for both admin-authored and community-submitted projects, with
 * `status` carrying the moderation state and `source` recording who wrote the
 * row. A separate submissions table was considered and rejected: a submission
 * that is approved *is* a project — same title, category, summary and link — so
 * a second table would mean the approve step copies eight fields across, and
 * every column added later has to be added twice or the shapes drift.
 *
 * (This is the opposite call to meta_leads vs leads, and the difference is
 * real: those two have different lifecycles and screens forever, while these
 * converge into the identical record the moment one is approved.)
 *
 * `categoryId` is SET NULL: losing a shelf label must not delete what is on the
 * shelf. A *new* project still cannot be filed nowhere — the controller
 * requires one, because the tile grid is the only navigation the section has.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Projects", {
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

      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      categoryId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "ProjectCategories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      level: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      prerequisites: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      },

      skills: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      },

      // Any absolute http(s) URL. We host nothing; see PROJECTS_PLAN.md §9 on
      // link rot and why there is no auto-unpublish.
      downloadUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      thumbnail: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // No FK: a deleted project is filtered out at read time rather than
      // cascading edits into every row that referenced it.
      relatedProjectIds: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      },

      seo: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "approved",
      },

      source: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "admin",
      },

      submitter: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      reviewedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // Denormalised on purpose, with no FK to AdminUsers — a deleted admin
      // must not take the review history with them.
      reviewedByAdminId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      rejectionReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // Gate passes. Internal; the number the panel shows is a count of
      // ProjectLeads rows. See the model.
      downloadCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

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

    await queryInterface.addIndex("Projects", ["categoryId"], {
      name: "projects_category_id",
    });

    await queryInterface.addIndex("Projects", ["level"], {
      name: "projects_level",
    });

    // The public list's query, in its exact shape: approved and published,
    // newest first.
    await queryInterface.addIndex(
      "Projects",
      ["status", "isPublished", "publishedAt"],
      { name: "projects_status_published" },
    );

    // The review queue.
    await queryInterface.addIndex("Projects", ["source", "status"], {
      name: "projects_source_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Projects");
  },
};
