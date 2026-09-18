import { DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_PERSON } from "../../../config/constants/workflow.js";

/**
 * Global workflow policy. Exactly one row, id 1.
 *
 * Not a per-workflow setting and not an environment variable: it is a policy
 * about the *person*, it has to be changeable without a deploy, and it has to
 * be visible to the admin who is wondering why their new workflow enrolled
 * nobody.
 *
 * The single-row shape is enforced by a check constraint in the migration
 * rather than by convention — a second row here would mean two answers to
 * "how many workflows may this person be in", which is the same class of bug
 * that having two suppression tables would be.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.7 and §8.3.
 */
export default (sequelize, DataTypes) => {
  const WorkflowSetting = sequelize.define(
    "WorkflowSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        defaultValue: 1,
      },

      /**
       * Default 1: while somebody is being walked through a nurture sequence,
       * a second workflow cannot start mailing them in parallel.
       */
      maxActiveWorkflowsPerPerson: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_PERSON,
        validate: {
          min: 1,
        },
      },

      updatedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "workflow_settings",
      timestamps: true,
    },
  );

  return WorkflowSetting;
};
