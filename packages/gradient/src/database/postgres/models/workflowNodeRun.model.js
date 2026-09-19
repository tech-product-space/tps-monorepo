import { ulid } from "ulid";
import { WORKFLOW_NODE_RUN_STATUS } from "../../../config/constants/workflow.js";

/**
 * One execution of one step, for one person.
 *
 * Append-only, and the reason "why did this person get that email" is
 * answerable at all. It is also half of the idempotency defence: a run is
 * opened before the send and closed after, so a row for the same
 * `(enrollmentId, nodeId, jobId, attempt)` is the signal that a redelivered job
 * may already have sent something.
 *
 * **A node can legitimately have more than one run.** A wait writes one when it
 * parks and another when it resumes, and both are the same node for the same
 * person. Keying idempotency on the node alone is what stopped every wait in
 * the product from ever finishing — see the migration
 * `20260819060000-node-run-claim-includes-job.js`.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.4 and §10.3.
 */
export default (sequelize, DataTypes) => {
  const WorkflowNodeRun = sequelize.define(
    "WorkflowNodeRun",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      enrollmentId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Node id within the frozen definition, not a foreign key. */
      nodeId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Denormalised so a run is readable without loading the version. */
      nodeType: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /**
       * The BullMQ job this run belongs to.
       *
       * Part of the idempotency key, and the part that makes it correct. Two
       * *different* jobs reaching the same node — a wait parking, then the
       * delayed job resuming it — are not duplicates of each other, and only
       * the job id can tell them apart: both carry `attemptsMade = 0`.
       *
       * Null on rows written before the key changed, which Postgres treats as
       * distinct and so never collides.
       */
      jobId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** BullMQ retry number within one job. 1 on the first pass. */
      attempt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: WORKFLOW_NODE_RUN_STATUS.RUNNING,
        validate: {
          isIn: [Object.values(WORKFLOW_NODE_RUN_STATUS)],
        },
      },

      startedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      finishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /** Whatever the handler chose to record — the outcome, the branch taken. */
      output: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /**
       * Captured even though bounce handling is deferred
       * (`MARKETING_CAMPAIGN_PLAN.md` §9.4) — it is one line in an edit already
       * being made, and it is the difference between switching delivery
       * tracking on later as a config change and re-running history to backfill
       * ids that no longer exist.
       */
      providerMessageId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "workflow_node_runs",
      timestamps: true,
      indexes: [
        /**
         * The idempotency key, and it is load-bearing rather than descriptive.
         *
         * Four columns, and each one is doing something:
         *
         * - `enrollmentId, nodeId` — this person, at this step
         * - `jobId` — *which* arrival at that step. Two distinct jobs are two
         *   real visits (park, then resume) and both must be allowed.
         * - `attempt` — which BullMQ retry of that job, so a step that genuinely
         *   failed can be run again.
         *
         * The same delivery of the same job arriving twice matches on all four
         * and exactly one insert survives; the loser is how `advanceEnrollment`
         * learns another worker already has this step.
         *
         * It read `(enrollmentId, nodeId, attempt)` before, which could not
         * distinguish a duplicate from a wait resuming, and so refused every
         * resume in the product.
         *
         * Declared here as well as in the migration so the constraint is
         * visible to anyone reading the model — this is the one index whose
         * absence sends somebody two copies of the same email.
         */
        {
          name: "workflow_node_runs_enrollment_node_job_attempt",
          unique: true,
          fields: ["enrollmentId", "nodeId", "jobId", "attempt"],
        },
      ],
    },
  );

  WorkflowNodeRun.associate = (models) => {
    WorkflowNodeRun.belongsTo(models.WorkflowEnrollment, {
      foreignKey: "enrollmentId",
      as: "enrollment",
    });
  };

  return WorkflowNodeRun;
};
