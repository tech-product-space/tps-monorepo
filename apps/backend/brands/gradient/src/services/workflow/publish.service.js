import db from "../../database/postgres/models/index.js";
import { WORKFLOW_STATUS } from "../../config/constants/workflow.js";
import { validateWorkflow, resolveEntryNode } from "./validate.js";
import logger from "../../util/logger.js";

const { Workflow, WorkflowVersion, sequelize } = db;

/**
 * Freezes the draft into a numbered version and sets the workflow live.
 *
 * The whole operation is one transaction: validate, take the next version
 * number, insert the snapshot, point the workflow at it. A publish that wrote
 * a version but failed to activate — or activated without a version — would
 * leave enrolments reading a definition that is not there.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.2 and §9.
 */
export const publishWorkflow = async (workflow, { publishedBy = null } = {}) => {
  const { valid, errors } = validateWorkflow(workflow);

  if (!valid) return { published: false, errors };

  const entry = resolveEntryNode(workflow.definition);

  const result = await sequelize.transaction(async (t) => {
    /**
     * The next version number, read under a row lock on the workflow.
     *
     * Two admins pressing Publish at the same moment would otherwise both
     * compute version 3. The unique index on `(workflowId, version)` is the
     * backstop; this lock is what makes the second one wait rather than fail.
     */
    const locked = await Workflow.findByPk(workflow.id, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    const latest = await WorkflowVersion.max("version", {
      where: { workflowId: workflow.id },
      transaction: t,
    });

    const version = (Number(latest) || 0) + 1;

    await WorkflowVersion.create(
      {
        workflowId: workflow.id,
        version,
        /**
         * Graph and trigger frozen together. A journey's meaning depends on
         * both — the same steps fed by a different audience is a different
         * workflow, and an enrolment has to be able to read the one it joined.
         */
        definition: {
          nodes: workflow.definition?.nodes ?? [],
          edges: workflow.definition?.edges ?? [],
          entryNodeId: entry?.id ?? null,
          trigger: {
            type: workflow.triggerType,
            config: workflow.triggerConfig ?? {},
          },
        },
        publishedBy,
        publishedAt: new Date(),
      },
      { transaction: t },
    );

    await locked.update(
      {
        status: WORKFLOW_STATUS.ACTIVE,
        currentVersion: version,
        publishedAt: new Date(),
      },
      { transaction: t },
    );

    return { version, workflow: locked };
  });

  logger.info("Workflow published", {
    workflowId: workflow.id,
    version: result.version,
    publishedBy,
  });

  return {
    published: true,
    errors: [],
    version: result.version,
    workflow: result.workflow,
  };
};

/**
 * The definition an enrolment is actually walking.
 *
 * Always read through this, never `workflow.definition` — that is the draft and
 * it moves under a live enrolment. Getting this wrong is the bug the whole
 * versions table exists to prevent, so it is worth having exactly one way to do
 * it right.
 */
export const loadVersionDefinition = async (workflowId, version) => {
  const row = await WorkflowVersion.findOne({
    where: { workflowId, version },
    attributes: ["definition"],
  });

  return row?.definition ?? null;
};
