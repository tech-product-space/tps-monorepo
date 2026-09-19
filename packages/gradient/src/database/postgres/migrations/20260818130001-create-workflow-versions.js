"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_versions", {
      id: { type: Sequelize.STRING, primaryKey: true, allowNull: false },

      workflowId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "workflows", key: "id" },
        // A workflow is archived, never destroyed, so this cascade should never
        // fire in normal operation. It is here so that a deliberate hard delete
        // in a console does not leave orphaned versions behind.
        onDelete: "CASCADE",
      },

      version: { type: Sequelize.INTEGER, allowNull: false },

      /** `{ nodes, edges, entryNodeId, trigger }`, frozen. */
      definition: { type: Sequelize.JSONB, allowNull: false },

      publishedBy: { type: Sequelize.STRING, allowNull: true },
      publishedAt: { type: Sequelize.DATE, allowNull: false },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      // No updatedAt — a published version is a snapshot, and every live
      // enrolment is reading it.
    });

    /**
     * One row per version per workflow.
     *
     * This is also what makes publish safe under a double-click: the next
     * version number is computed and inserted, and a concurrent second publish
     * loses on the constraint rather than creating two rows called version 3.
     * It serves lookup-by-workflow on its own, so there is deliberately no
     * second index.
     */
    await queryInterface.addIndex("workflow_versions", ["workflowId", "version"], {
      unique: true,
      name: "workflow_versions_workflow_version_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_versions");
  },
};
