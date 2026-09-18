"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflows", {
      id: { type: Sequelize.STRING, primaryKey: true, allowNull: false },

      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "draft",
      },

      triggerType: { type: Sequelize.STRING, allowNull: true },

      triggerConfig: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /** The editable draft graph. The published copy lives in workflow_versions. */
      definition: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: { nodes: [], edges: [], entryNodeId: null },
      },

      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      currentVersion: { type: Sequelize.INTEGER, allowNull: true },
      publishedAt: { type: Sequelize.DATE, allowNull: true },

      /** Deliberately not a foreign key — a deleted admin must not cascade
       *  into deleting the workflow they created. */
      createdBy: { type: Sequelize.STRING, allowNull: true },

      lastRunAt: { type: Sequelize.DATE, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    /**
     * The trigger evaluator's hot path: every ACTIVE workflow watching a given
     * trigger type, on every qualifying row that lands anywhere in the product.
     * Partial, because that query never looks at a draft or an archived row and
     * those are most of the table over time.
     */
    await queryInterface.sequelize.query(
      `CREATE INDEX workflows_active_by_trigger
         ON workflows ("triggerType")
         WHERE status = 'active'`,
    );

    // The list page: filtered by status, newest first.
    await queryInterface.addIndex("workflows", ["status", "createdAt"], {
      name: "workflows_status_created_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflows");
  },
};
