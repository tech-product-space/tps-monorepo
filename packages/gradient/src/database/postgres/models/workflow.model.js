import { ulid } from "ulid";
import {
  WORKFLOW_STATUS,
  WORKFLOW_TRIGGER_TYPE,
  EMPTY_DEFINITION,
} from "../../../config/constants/workflow.js";

/**
 * A workflow, and its editable draft.
 *
 * One row per workflow, forever. `definition` is the **draft** — editing it has
 * no effect on anybody already running until it is published, at which point it
 * is frozen into a `WorkflowVersion` and `currentVersion` points at it.
 *
 * That split is what lets an admin edit a live workflow without stranding the
 * forty people halfway through it. See `WORKFLOW_AUTOMATION_PLAN.md` §4.1–4.2.
 */
export default (sequelize, DataTypes) => {
  const Workflow = sequelize.define(
    "Workflow",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      /** Internal label. Recipients never see it. */
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: WORKFLOW_STATUS.DRAFT,
        validate: {
          isIn: [Object.values(WORKFLOW_STATUS)],
        },
      },

      triggerType: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          // `allowNull` and `isIn` together: a draft legitimately has no
          // trigger yet, and the validator will not let it publish that way.
          isIn: {
            args: [[...Object.values(WORKFLOW_TRIGGER_TYPE), null]],
            msg: "Unknown trigger type",
          },
        },
      },

      /** Shape depends on `triggerType`. Validated at publish, not here. */
      triggerConfig: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /**
       * The draft graph: `{ nodes, edges, entryNodeId }`.
       *
       * `nodes[].position` is persisted even though the phase-4 editor is a
       * linear list, so the canvas in phase 5 opens existing workflows at the
       * layout they were built in rather than guessing one.
       */
      definition: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: () => ({ ...EMPTY_DEFINITION }),
      },

      /** Reserved for per-workflow overrides. Empty until one is genuinely needed. */
      settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /** Points at the live `workflow_versions` row. Null until first publish. */
      currentVersion: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      /** Admin id. Denormalised on purpose — a deleted admin must not delete
       *  the workflow, and there is no association for the same reason the
       *  activity log has none. */
      createdBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * Last time it enrolled anybody.
       *
       * The "is this thing alive" column. A workflow that is `active` with a
       * trigger and a null `lastRunAt` is the exact state that looks healthy
       * in a list and is doing nothing, so the list surfaces it.
       */
      lastRunAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "workflows",
      timestamps: true,
    },
  );

  Workflow.associate = (models) => {
    Workflow.hasMany(models.WorkflowVersion, {
      foreignKey: "workflowId",
      as: "versions",
    });
    Workflow.hasMany(models.WorkflowEnrollment, {
      foreignKey: "workflowId",
      as: "enrollments",
    });
  };

  return Workflow;
};
