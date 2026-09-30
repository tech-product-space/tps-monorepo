"use strict";

/**
 * The guide — ordered, authored steps, one level deep.
 *
 * CASCADE on delete, which is right here and nowhere else in this feature: a
 * step has no meaning without its project, unlike a lead (which is a person) or
 * a category (which is shared). Deleting a project should take its guide with
 * it rather than leave orphan rows nothing can reach.
 *
 * `slug` is unique per project, not globally — the URL is already scoped by the
 * project, and a global unique index would mean the second project to want a
 * step called "setup" could not have one.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProjectSteps", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      projectId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "Projects", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      // TiptapEditor ProseMirror JSON, the same shape as FreeCourseLessons —
      // which is what carries the code blocks.
      content: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      seo: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
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

    await queryInterface.addIndex("ProjectSteps", ["projectId", "slug"], {
      unique: true,
      name: "project_steps_project_slug_unique",
    });

    // The sidebar's query: this project's steps, in order.
    await queryInterface.addIndex("ProjectSteps", ["projectId", "order"], {
      name: "project_steps_project_order",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ProjectSteps");
  },
};
