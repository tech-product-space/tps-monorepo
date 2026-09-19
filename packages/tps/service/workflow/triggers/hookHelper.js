"use strict";

const {
  enqueueEvaluateTrigger,
} = require("../../../queues/workflowQueues");

/**
 * Sequelize afterCreate / afterBulkCreate handler that fires a trigger
 * evaluation when a new lead row lands.
 *
 * Safety contract:
 *   - Never blocks the parent insert (no await).
 *   - Never throws.
 *   - If the insert is inside a transaction, defers to afterCommit so the
 *     worker doesn't try to read a row that hasn't been committed yet.
 *   - If Redis is down, logs and swallows — the workflow miss is acceptable.
 *     A future hardening phase can introduce an outbox.
 */
function fireAfterCreate(sourceType, sourceId, options) {
  if (sourceId == null) return;

  const fire = () => {
    enqueueEvaluateTrigger({ sourceType, sourceId: String(sourceId) }).catch(
      (err) => {
        console.error(
          `[trigger-hook] enqueue failed for ${sourceType}:${sourceId}:`,
          err.message
        );
      }
    );
  };

  const tx = options && options.transaction;
  if (tx && typeof tx.afterCommit === "function") {
    tx.afterCommit(fire);
  } else {
    fire();
  }
}

module.exports = { fireAfterCreate };
