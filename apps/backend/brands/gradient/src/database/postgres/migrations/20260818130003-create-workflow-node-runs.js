"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_node_runs", {
      id: { type: Sequelize.STRING, primaryKey: true, allowNull: false },

      enrollmentId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "workflow_enrollments", key: "id" },
        onDelete: "CASCADE",
      },

      /** Node id within the frozen definition. Not a foreign key — the graph
       *  lives in JSONB, and the node may not exist in a later version. */
      nodeId: { type: Sequelize.STRING, allowNull: false },
      nodeType: { type: Sequelize.STRING, allowNull: false },

      attempt: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "running",
      },

      startedAt: { type: Sequelize.DATE, allowNull: false },
      finishedAt: { type: Sequelize.DATE, allowNull: true },

      output: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      providerMessageId: { type: Sequelize.STRING, allowNull: true },
      error: { type: Sequelize.TEXT, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    /** The enrolment detail page: every step this person took, in order. */
    await queryInterface.addIndex(
      "workflow_node_runs",
      ["enrollmentId", "startedAt"],
      { name: "workflow_node_runs_enrollment_started_at" },
    );

    /**
     * Half the idempotency defence (§10.3): "has this node already run for this
     * person on this attempt". A redelivered job asks exactly this before it
     * sends anything.
     */
    await queryInterface.addIndex(
      "workflow_node_runs",
      ["enrollmentId", "nodeId", "attempt"],
      { name: "workflow_node_runs_enrollment_node_attempt" },
    );

    /**
     * The join key for delivery events, if bounce/complaint handling is ever
     * switched on (`MARKETING_CAMPAIGN_PLAN.md` §9.4). Partial, because most
     * runs are waits and exits that never touch a provider.
     */
    await queryInterface.sequelize.query(
      `CREATE INDEX workflow_node_runs_provider_message_id
         ON workflow_node_runs ("providerMessageId")
         WHERE "providerMessageId" IS NOT NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_node_runs");
  },
};
