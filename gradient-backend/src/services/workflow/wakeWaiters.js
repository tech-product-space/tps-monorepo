import { WORKFLOW_ENROLLMENT_STATUS } from "../../config/constants/workflow.js";
import { enqueueAdvance } from "../../queues/workflowQueues.js";
import logger from "../../util/logger.js";

const getModels = async () =>
  (await import("../../database/postgres/models/index.js")).default;

/**
 * Wakes anybody parked on a branch, the moment they do the thing.
 *
 * Without this, "did they register in the next five days?" only branches on day
 * five — so somebody who registers an hour after the email still waits the full
 * window for the "great, see you there" follow-up. Correct, and useless.
 *
 * **Deliberately a shortcut, never the mechanism.** The branch handler always
 * schedules an advance at its own deadline, so a wake that never fires, or
 * fires and fails, costs a *timely* email and not a *correct* one. That is why
 * there is no waiter table to keep in sync — TPS has `workflow_condition_waiters`
 * and a cron to reconcile it; here the enrolment row already knows what it is
 * waiting for, in `context.branch`.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §7.
 */
export const wakeWaiters = async (email, eventType) => {
  if (!email || !eventType) return 0;

  try {
    const { WorkflowEnrollment } = await getModels();

    /**
     * Matched in SQL on the JSONB marker, so this is one indexed lookup rather
     * than a scan of every parked enrolment. It runs on **every** lead event —
     * a download, a registration, a lesson — so it has to be cheap even when
     * nobody is waiting, which is almost always.
     */
    const waiting = await WorkflowEnrollment.findAll({
      where: {
        email,
        status: WORKFLOW_ENROLLMENT_STATUS.WAITING,
      },
      attributes: ["id", "context"],
      limit: 50,
    });

    if (!waiting.length) return 0;

    let woken = 0;

    for (const enrollment of waiting) {
      // Only the ones waiting for *this* event. Re-advancing the rest would
      // make the branch handler re-evaluate, find nothing, and re-park — no
      // harm, but a query per parked person per unrelated event.
      if (enrollment.context?.branch?.eventType !== eventType) continue;

      const job = await enqueueAdvance(enrollment.id, { delay: 0 });

      if (job?.id) {
        await WorkflowEnrollment.update(
          { jobId: job.id },
          { where: { id: enrollment.id } },
        );
        woken += 1;
      }
    }

    if (woken) {
      logger.info("[workflow.wake] woke parked enrolments", {
        email,
        eventType,
        woken,
      });
    }

    return woken;
  } catch (error) {
    // Swallowed on purpose. This runs off the back of recording an activity
    // event, which itself must never affect the request that caused it — and a
    // failure here only means the branch resolves at its deadline instead of
    // early.
    logger.error("Could not wake parked enrolments", {
      email,
      eventType,
      error: error.message,
    });
    return 0;
  }
};
