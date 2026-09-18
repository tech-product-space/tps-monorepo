import { ulid } from "ulid";

/**
 * A published, immutable snapshot of a workflow.
 *
 * `definition` here is `{ nodes, edges, entryNodeId, trigger }` — the graph and
 * the trigger frozen together, because a journey's meaning depends on both.
 *
 * **Why versions are not optional.** Someone is on day four of a seven-day
 * sequence when an admin deletes step five and adds two new ones. Without this
 * table their cursor points at a node that no longer exists, and the engine
 * either crashes or silently drops them. With it, they finish the journey they
 * started and everyone enrolled after the publish gets the new one. It costs
 * one table and one integer.
 *
 * Nothing updates a row here. See `WORKFLOW_AUTOMATION_PLAN.md` §4.2.
 */
export default (sequelize, DataTypes) => {
  const WorkflowVersion = sequelize.define(
    "WorkflowVersion",
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

      /** 1, 2, 3… per workflow. Unique with `workflowId`. */
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      definition: {
        type: DataTypes.JSONB,
        allowNull: false,
      },

      publishedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      publishedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "workflow_versions",
      // Append-only: a published version that can be edited is not a snapshot
      // of anything, and every live enrolment is reading it.
      timestamps: true,
      updatedAt: false,
    },
  );

  WorkflowVersion.associate = (models) => {
    WorkflowVersion.belongsTo(models.Workflow, {
      foreignKey: "workflowId",
      as: "workflow",
    });
  };

  return WorkflowVersion;
};
