"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_enrollments", {
      id: { type: Sequelize.STRING, primaryKey: true, allowNull: false },

      workflowId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "workflows", key: "id" },
        onDelete: "CASCADE",
      },

      workflowVersion: { type: Sequelize.INTEGER, allowNull: false },

      /** Lowercased by the enrolment path. Every index below leads with it. */
      email: { type: Sequelize.STRING, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: true },
      phone: { type: Sequelize.STRING, allowNull: true },

      sourceType: { type: Sequelize.STRING, allowNull: true },
      sourceId: { type: Sequelize.STRING, allowNull: true },

      enrollmentSource: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "manual",
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "active",
      },

      currentNodeId: { type: Sequelize.STRING, allowNull: true },

      /** When this enrolment is due. The authority, not the BullMQ delay. */
      nextRunAt: { type: Sequelize.DATE, allowNull: true },

      jobId: { type: Sequelize.STRING, allowNull: true },

      context: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      enrolledAt: { type: Sequelize.DATE, allowNull: false },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      endReason: { type: Sequelize.STRING, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    /**
     * One live enrolment per person per workflow, enforced by the database.
     *
     * **Covers every in-flight status, not just `active`.** TPS's equivalent
     * index is `WHERE status='active'` and leaves `waiting` to application
     * code, which its own README lists as a gotcha — the whole value of a
     * database constraint is that it holds when the application logic is
     * wrong. `waiting` has no writer until the branch node ships; it is in the
     * predicate now so that adding one later is not a migration on a live
     * table plus a window where the rule does not hold.
     */
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX workflow_enrollments_live_unique
         ON workflow_enrollments ("workflowId", email)
         WHERE status IN ('active','waiting')`,
    );

    /**
     * The reconcile cron's only query: overdue and live (§10.4). Partial for
     * the same reason — completed enrolments are the bulk of the table within
     * a month and this query never looks at one.
     */
    await queryInterface.sequelize.query(
      `CREATE INDEX workflow_enrollments_due
         ON workflow_enrollments ("nextRunAt")
         WHERE status IN ('active','waiting')`,
    );

    /** Identity lookups: the cap, in-flight checks, one person's history. */
    await queryInterface.addIndex("workflow_enrollments", ["email", "status"], {
      name: "workflow_enrollments_email_status",
    });

    /** The per-workflow enrolment list and its stats roll-up. */
    await queryInterface.addIndex(
      "workflow_enrollments",
      ["workflowId", "status"],
      { name: "workflow_enrollments_workflow_status" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_enrollments");
  },
};
