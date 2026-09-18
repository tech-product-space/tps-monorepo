import { enqueueEvaluateTrigger } from "../../../queues/workflowQueues.js";
import logger from "../../../util/logger.js";

/**
 * The single wrapper every realtime trigger goes through.
 *
 * Model hooks call this and nothing else, which buys three things:
 *
 * 1. **It defers to `transaction.afterCommit`.** Sequelize hooks run *before*
 *    commit, so without this a rolled-back registration would still enqueue a
 *    trigger and enrol somebody who does not exist.
 * 2. **It never throws into the caller.** Every emit point sits on the path of
 *    a public form submission; a Redis blip must not turn that into a 500 for
 *    a visitor.
 * 3. **It is the one place an outbox would go.** §4.6 names the gap this
 *    design accepts — if Redis is unreachable at the moment a lead arrives,
 *    that trigger is lost outright, because no enrolment row exists for the
 *    reconcile cron to find. Closing it means writing a
 *    `workflow_trigger_events` row here inside the caller's transaction and
 *    draining it from the worker. One file, because of this wrapper.
 *
 * Until then the mitigation is monitoring, not code: the enqueue helper logs
 * failures under the distinct tag `[workflow.trigger-lost]`, and that tag is
 * worth an alert.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §5.1.
 *
 * @param {string} sourceType a `CAMPAIGN_SOURCE_TYPE` value
 * @param {object} row        the freshly created Sequelize instance
 * @param {object} [options]  the hook's options — carries `transaction`
 */
export const emitTriggerEvent = (sourceType, row, options = {}) => {
  if (!row?.id) return;

  const fire = () => {
    // Detached. Nothing upstream should be able to await, and so be delayed by,
    // a workflow evaluation.
    enqueueEvaluateTrigger({ sourceType, sourceId: row.id }).catch((error) =>
      logger.error("[workflow.trigger-lost] emit failed", {
        sourceType,
        sourceId: row.id,
        error: error.message,
      }),
    );
  };

  if (options.transaction) {
    options.transaction.afterCommit(fire);
    return;
  }

  fire();
};
