import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_STATUS,
  WORKFLOW_ENROLLMENT_SOURCE,
} from "../../config/constants/workflow.js";
import { buildRecipients } from "../../services/campaign/buildRecipients.js";
import { enrolPerson } from "../../services/workflow/enrollment.service.js";
import { getWorkflowSettings } from "../../services/workflow/settings.service.js";
import { loadVersionDefinition } from "../../services/workflow/publish.service.js";
import logger from "../../util/logger.js";

const { Workflow } = db;

/**
 * A static-list Run.
 *
 * Resolves the audience with **the campaign's own `buildRecipients`** — the
 * same twelve resolvers, the same `{ include, exclude }` shape, the same
 * dedupe. A workflow's static-list audience *is* a campaign audience, and a
 * second implementation would be a second set of bugs.
 *
 * Concurrency 1 on this queue, so two Runs of the same workflow queue up rather
 * than racing each other into the unique index.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §5.2.
 */
export const runBulkEnroll = async (job) => {
  const { workflowId, runId } = job.data;

  const workflow = await Workflow.findByPk(workflowId);

  if (!workflow) {
    logger.warn("Bulk enrol: workflow not found", { workflowId });
    return { enrolled: 0 };
  }

  // Re-checked here, not only at the endpoint: a Run can be queued and the
  // workflow paused before the job is picked up, and this is the last point
  // that can be caught before several thousand people are enrolled.
  if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
    logger.info("Bulk enrol: workflow is not active, skipping", {
      workflowId,
      status: workflow.status,
    });
    return { enrolled: 0, skipped: "notActive" };
  }

  const filters = workflow.triggerConfig?.recipientFilters;

  const { recipients, stats } = await buildRecipients(filters);

  if (!recipients.length) {
    logger.info("Bulk enrol: nobody matched", { workflowId, runId });
    return { enrolled: 0, resolved: 0 };
  }

  // Loaded once for the whole run: the definition and the cap are the same for
  // every person in it, and reading them per recipient would be two queries
  // times the size of the audience.
  const [settings, definition] = await Promise.all([
    getWorkflowSettings(),
    loadVersionDefinition(workflow.id, workflow.currentVersion),
  ]);

  const result = {
    resolved: recipients.length,
    excluded: stats?.excluded ?? 0,
    enrolled: 0,
    skipped: {},
  };

  const skip = (reason) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  for (const recipient of recipients) {
    try {
      const outcome = await enrolPerson({
        workflow,
        email: recipient.email,
        name: recipient.name,
        sourceType: recipient.sourceType,
        sourceId: recipient.sourceId,
        enrollmentSource: WORKFLOW_ENROLLMENT_SOURCE.STATIC_LIST,
        allowReEnrollment: Boolean(workflow.triggerConfig?.allowReEnrollment),
        settings,
        definition,
        context: { runId },
      });

      if (outcome.enrolled) result.enrolled += 1;
      else skip(outcome.reason);
    } catch (error) {
      // One bad recipient must not end the run for the other 3,499.
      skip("error");
      logger.error("Bulk enrol failed for one recipient", {
        workflowId,
        email: recipient.email,
        error: error.message,
      });
    }
  }

  /**
   * The skip breakdown is the point of this log line.
   *
   * "Resolved 3,500 and enrolled 900" is alarming with no explanation and
   * unremarkable with one — most of the gap is usually people already live in
   * another workflow, which is the cap doing exactly what it is for.
   */
  logger.info(`[workflow.bulk-enroll] ${workflowId} -> ${JSON.stringify(result)}`);

  return result;
};
