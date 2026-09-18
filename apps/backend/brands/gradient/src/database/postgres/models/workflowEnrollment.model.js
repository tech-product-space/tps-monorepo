import { ulid } from "ulid";
import {
  WORKFLOW_ENROLLMENT_STATUS,
  WORKFLOW_ENROLLMENT_SOURCE,
} from "../../../config/constants/workflow.js";

/**
 * One person's run through one workflow.
 *
 * Redis holds the jobs; **this table holds the truth**. `nextRunAt` is written
 * alongside every delayed job and is never derived from the queue — it is what
 * the reconcile cron compares against, and what lets resume-after-pause restore
 * the original deadline rather than extending every wait by the length of the
 * pause.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.3.
 */
export default (sequelize, DataTypes) => {
  const WorkflowEnrollment = sequelize.define(
    "WorkflowEnrollment",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      workflowId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /**
       * The frozen definition this person is walking. Read the version, never
       * `workflows.definition` — that is the draft and it moves under them.
       */
      workflowVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      /** Lowercased. The identity for the whole feature (§8.1). */
      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Snapshots, for `{{name}}` and for the enrolment detail page. */
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * Which row enrolled them. `CAMPAIGN_SOURCE_TYPE` vocabulary, so an
       * enrolment and a campaign recipient describe their origin with the same
       * word.
       */
      sourceType: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      sourceId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** How they got in — orthogonal to `sourceType`. */
      enrollmentSource: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: WORKFLOW_ENROLLMENT_SOURCE.MANUAL,
        validate: {
          isIn: [Object.values(WORKFLOW_ENROLLMENT_SOURCE)],
        },
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: WORKFLOW_ENROLLMENT_STATUS.ACTIVE,
        validate: {
          isIn: [Object.values(WORKFLOW_ENROLLMENT_STATUS)],
        },
      },

      /** Cursor into `definition.nodes`. */
      currentNodeId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * When this enrolment is due.
       *
       * The authority, not the BullMQ delay. Two systems can disagree about
       * what is scheduled; only one of them survives a Redis restart.
       */
      nextRunAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /**
       * The BullMQ job currently scheduled for this row, so a cancel can remove
       * it and the reconcile cron can ask whether it still exists.
       */
      jobId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Per-enrolment scratch: the trigger payload, branch outcomes. */
      context: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      enrolledAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /** `WORKFLOW_END_REASON`, with the error message appended for `error`. */
      endReason: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "workflow_enrollments",
      timestamps: true,
    },
  );

  WorkflowEnrollment.associate = (models) => {
    WorkflowEnrollment.belongsTo(models.Workflow, {
      foreignKey: "workflowId",
      as: "workflow",
    });
    WorkflowEnrollment.hasMany(models.WorkflowNodeRun, {
      foreignKey: "enrollmentId",
      as: "nodeRuns",
    });
  };

  return WorkflowEnrollment;
};
