import { Op } from "sequelize";

import db from "../database/postgres/models/index.js";
import { WORKFLOW_LIVE_STATUSES } from "../config/constants/workflow.js";
import {
  advanceJobExists,
  enqueueAdvance,
} from "../queues/workflowQueues.js";
import logger from "../util/logger.js";

const { WorkflowEnrollment } = db;

/**
 * Finds enrolments that are overdue with nothing scheduled, and re-queues them.
 *
 * **This is the price of the state living in two systems, and it is not
 * optional.** A Redis restart without persistence, an eviction under memory
 * pressure, or a job dropped during a failover leaves an enrolment that says
 * `active`, is overdue, and has no job behind it. Nothing else in the product
 * would ever notice: no error is raised, no row looks wrong, and the person
 * simply stops receiving the rest of their journey.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §10.4.
 */

/** How far past due before a row is considered stranded rather than in flight. */
const GRACE_MS = 5 * 60 * 1000;

/** Capped per pass, so a bad Redis day cannot turn into one enormous query. */
const BATCH = 500;

export const reconcileEnrollments = async () => {
  const cutoff = new Date(Date.now() - GRACE_MS);

  const overdue = await WorkflowEnrollment.findAll({
    where: {
      status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
      nextRunAt: { [Op.lt]: cutoff },
    },
    attributes: ["id", "jobId", "nextRunAt"],
    order: [["nextRunAt", "ASC"]],
    limit: BATCH,
  });

  if (!overdue.length) return { checked: 0, rescued: 0 };

  let rescued = 0;

  for (const enrollment of overdue) {
    // Ask Redis whether the job is still there. A job that exists and is simply
    // running long is not stranded, and re-queuing it would double the send.
    if (await advanceJobExists(enrollment.jobId)) continue;

    const job = await enqueueAdvance(enrollment.id, { delay: 0 });

    if (job?.id) {
      await WorkflowEnrollment.update(
        { jobId: job.id },
        { where: { id: enrollment.id } },
      );
      rescued += 1;
    }
  }

  /**
   * Logged every pass, with the count.
   *
   * A number that is normally zero and suddenly is not is the earliest signal
   * that Redis is misconfigured — most often `maxmemory-policy` set to an
   * `allkeys-*` eviction, which silently deletes queue data. Set `noeviction`
   * on the Redis used for queues.
   */
  if (rescued) {
    logger.warn("[workflow.reconcile] rescued stranded enrolments", {
      checked: overdue.length,
      rescued,
    });
  } else {
    logger.info("[workflow.reconcile] nothing stranded", {
      checked: overdue.length,
    });
  }

  return { checked: overdue.length, rescued };
};
