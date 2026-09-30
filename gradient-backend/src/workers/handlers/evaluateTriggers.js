import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_STATUS,
  WORKFLOW_TRIGGER_TYPE,
  WORKFLOW_ENROLLMENT_SOURCE,
} from "../../config/constants/workflow.js";
import {
  loadTriggerSubject,
  matchesTriggerSource,
} from "../../services/workflow/triggers/sourceLoader.js";
import { enrolPerson } from "../../services/workflow/enrollment.service.js";
import { getWorkflowSettings } from "../../services/workflow/settings.service.js";
import logger from "../../util/logger.js";

const { Workflow } = db;

/**
 * "Something happened — does it start any workflow?"
 *
 * Fired by a model hook the moment a lead, registration, download, free-course
 * enrolment or account is created. Loads the person, tests every active
 * realtime workflow's filter, and enrols where it matches.
 *
 * **Every outcome is logged with its reason.** A trigger that quietly enrols
 * nobody is indistinguishable from a broken filter, and that is an hour of
 * someone's afternoon.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §5.1.
 */
export const evaluateTriggers = async (job) => {
  const { sourceType, sourceId } = job.data;

  const subject = await loadTriggerSubject(sourceType, sourceId);

  if (!subject) {
    logger.info(`[workflow.evaluate-triggers] src=${sourceType}:${sourceId}`, {
      outcome: "noSubject",
    });
    return { evaluated: 0, enrolled: 0 };
  }

  const workflows = await Workflow.findAll({
    where: {
      status: WORKFLOW_STATUS.ACTIVE,
      triggerType: WORKFLOW_TRIGGER_TYPE.NEW_ACTIVITY,
    },
  });

  if (!workflows.length) {
    return { evaluated: 0, enrolled: 0 };
  }

  // Read once for the whole fan-out rather than once per workflow.
  const settings = await getWorkflowSettings();

  const result = { evaluated: 0, enrolled: 0, skipped: {} };

  const skip = (reason) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  for (const workflow of workflows) {
    result.evaluated += 1;

    const sources = workflow.triggerConfig?.sources ?? [];

    const matched = sources.some((clause) =>
      matchesTriggerSource(subject, clause),
    );

    if (!matched) {
      skip("filter");
      continue;
    }

    try {
      const outcome = await enrolPerson({
        workflow,
        email: subject.email,
        name: subject.name,
        phone: subject.phone,
        sourceType: subject.sourceType,
        sourceId: subject.sourceId,
        enrollmentSource: WORKFLOW_ENROLLMENT_SOURCE.NEW_ACTIVITY,
        allowReEnrollment: Boolean(workflow.triggerConfig?.allowReEnrollment),
        settings,
        context: { trigger: { sourceType, sourceId } },
      });

      if (outcome.enrolled) result.enrolled += 1;
      else skip(outcome.reason);
    } catch (error) {
      // One workflow's failure must not stop the others from evaluating.
      skip("error");
      logger.error("Trigger evaluation failed for one workflow", {
        workflowId: workflow.id,
        sourceType,
        sourceId,
        error: error.message,
      });
    }
  }

  logger.info(
    `[workflow.evaluate-triggers] src=${sourceType}:${sourceId} -> ` +
      JSON.stringify(result),
  );

  return result;
};
