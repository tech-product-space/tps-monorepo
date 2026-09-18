"use strict";

/**
 * The download email: one global template, overridable per project.
 *
 * `projectId IS NULL` is the global default. That makes NULL meaningful, which
 * is a cost — paid down here, with two **partial** unique indexes, and in
 * `resolveProjectEmail()`, which is the only reader.
 *
 * A single unique index cannot express this. `UNIQUE (projectId, type)` does
 * not constrain the global rows at all, because in SQL every NULL is distinct
 * from every other NULL — so nothing would stop a second, third and fourth
 * global template for the same type, and which one won would be whichever the
 * query happened to return first.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProjectEmailTemplates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      // NULL = the global default.
      projectId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "Projects", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      type: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subject: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      isEnabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    // One global per type.
    await queryInterface.addIndex("ProjectEmailTemplates", ["type"], {
      unique: true,
      name: "project_email_templates_global_type",
      where: { projectId: null },
    });

    // One override per (project, type).
    await queryInterface.addIndex(
      "ProjectEmailTemplates",
      ["projectId", "type"],
      {
        unique: true,
        name: "project_email_templates_project_type",
        where: { projectId: { [Sequelize.Op.ne]: null } },
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ProjectEmailTemplates");
  },
};
