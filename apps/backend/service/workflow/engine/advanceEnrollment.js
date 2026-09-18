"use strict";

const {
  sequelize,
  Workflow,
  WorkflowVersion,
  WorkflowEnrollment,
  WorkflowNodeRun,
} = require("../../../models");
const { Transaction } = require("sequelize");
const {
  WORKFLOW_STATUS,
  ENROLLMENT_STATUS,
  NODE_RUN_STATUS,
  NODE_TYPE,
} = require("../../../constants/workflow");
const { getHandler } = require("./handlerRegistry");
const { pickDefaultNextNode } = require("./utils/pickNextNode");
const { computeDelayMs } = require("./utils/computeDelay");
const { enqueueAdvance } = require("../../../queues/workflowQueues");

const PAUSED_RETRY_DELAY_MS = 60_000;

// Sequelize/pg error names that indicate a transient infrastructure blip
// (connection pool exhaustion, query timeout, dropped socket, etc.). When a
// node handler throws one of these we want BullMQ to retry the whole advance,
// not permanently fail the lead — the underlying state isn't broken, the DB
// just hiccuped. Lower-cased for case-insensitive matching.
const TRANSIENT_DB_ERROR_NAMES = new Set([
  "sequelizetimeouterror",
  "sequelizeconnectionerror",
  "sequelizeconnectionacquiretimeouterror",
  "sequelizeconnectiontimedouterror",
  "sequelizeconnectionrefusederror",
  "sequelizehostnotreachableerror",
  "sequelizehostnotfounderror",
  "sequelizeaccessdeniederror",
  "sequelizeinvalidconnectionerror",
]);

// pg / node network error codes that map to the same "retry, don't bury"
// behaviour. statement_timeout from the Postgres server itself surfaces as
// '57014' (query_canceled).
const TRANSIENT_DB_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "EHOSTUNREACH",
  "57014", // query_canceled (statement_timeout fired)
  "53300", // too_many_connections
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
]);

function isTransientDbError(err) {
  if (!err) return false;
  if (err.retryable === true) return true;
  const name = (err.name || "").toLowerCase();
  if (TRANSIENT_DB_ERROR_NAMES.has(name)) return true;
  const code = err.code || err?.original?.code || err?.parent?.code;
  if (code && TRANSIENT_DB_ERROR_CODES.has(String(code))) return true;
  // Last-resort: substring sniff so we catch driver-specific phrasing like
  // pg-pool's "Operation timeout" or "Connection terminated".
  const msg = (err.message || "").toLowerCase();
  if (
    msg.includes("operation timeout") ||
    msg.includes("connection terminated") ||
    msg.includes("connection lost") ||
    msg.includes("client has encountered a connection error")
  ) {
    return true;
  }
  return false;
}

/**
 * The single transactional step that advances one enrollment by one node.
 *
 * Called by the BullMQ worker for the `workflow.advance` queue.
 * Job data shape:
 *   { enrollment_id, node_id, expected_attempt }
 * Deterministic job id: `${enrollment_id}:${node_id}:${attempt}`
 *
 * Guarantees:
 *  - All DB writes happen in a single Postgres transaction.
 *  - `SELECT ... FOR UPDATE` on the enrollment row serializes concurrent jobs.
 *  - `workflow_node_runs` unique (enrollment_id, node_id, attempt) guards
 *    against double-execution on duplicate job delivery.
 *  - The next job is enqueued only after the transaction commits
 *    (via `transaction.afterCommit`), so Redis never gets a job that DB
 *    rolled back.
 */
async function advanceEnrollment(job) {
  const {
    enrollment_id: enrollmentId,
    node_id: nodeId,
    expected_attempt: attempt = 1,
  } = job.data || {};

  if (!enrollmentId || !nodeId) {
    return { skipped: "bad_job_data" };
  }

  return await sequelize.transaction(async (tx) => {
    // 1. Load + lock enrollment
    const enrollment = await WorkflowEnrollment.findByPk(enrollmentId, {
      lock: Transaction.LOCK.UPDATE,
      transaction: tx,
    });
    if (!enrollment) return { skipped: "enrollment_not_found" };

    // WAITING enrollments are parked on a control.condition node — let them
    // re-enter so the handler can process the wake-up or timeout.
    if (
      enrollment.status !== ENROLLMENT_STATUS.ACTIVE &&
      enrollment.status !== ENROLLMENT_STATUS.WAITING
    ) {
      return { skipped: "enrollment_not_active", status: enrollment.status };
    }

    if (enrollment.current_node_id !== nodeId) {
      console.log(
        `[advance] SKIP already_advanced enr=${enrollment.id} ` +
          `job_node=${nodeId} actual=${enrollment.current_node_id} ` +
          `status=${enrollment.status}`
      );
      return {
        skipped: "already_advanced",
        expected: nodeId,
        actual: enrollment.current_node_id,
      };
    }

    // 2. Load workflow; bail out if paused (BullMQ will retry with backoff)
    const workflow = await Workflow.findByPk(enrollment.workflow_id, {
      transaction: tx,
    });
    if (!workflow) {
      await failEnrollment(enrollment, "workflow_not_found", tx);
      return { failed: "workflow_not_found" };
    }
    if (workflow.status === WORKFLOW_STATUS.PAUSED) {
      const err = new Error("workflow_paused");
      err.retryable = true;
      err.retryDelay = PAUSED_RETRY_DELAY_MS;
      throw err;
    }
    if (
      workflow.status === WORKFLOW_STATUS.ARCHIVED ||
      workflow.status === WORKFLOW_STATUS.DRAFT
    ) {
      // archived or reverted-to-draft — cancel the enrollment
      await enrollment.update(
        {
          status: ENROLLMENT_STATUS.CANCELLED,
          completed_at: new Date(),
          error_reason: `workflow_status:${workflow.status}`,
        },
        { transaction: tx }
      );
      return { cancelled: "workflow_not_active" };
    }

    // 3. Load pinned version + locate node
    const version = await WorkflowVersion.findOne({
      where: {
        workflow_id: workflow.id,
        version: enrollment.workflow_version,
      },
      transaction: tx,
    });
    if (!version) {
      await failEnrollment(enrollment, "workflow_version_missing", tx);
      return { failed: "version_missing" };
    }
    const def = version.definition || {};
    const nodes = Array.isArray(def.nodes) ? def.nodes : [];
    const edges = Array.isArray(def.edges) ? def.edges : [];

    const currentNode = nodes.find((n) => n.id === nodeId);
    if (!currentNode) {
      await failEnrollment(enrollment, `node_not_in_version:${nodeId}`, tx);
      return { failed: "node_missing" };
    }

    // 4. Idempotent node_run row
    const [nodeRun, created] = await WorkflowNodeRun.findOrCreate({
      where: {
        enrollment_id: enrollmentId,
        node_id: nodeId,
        attempt,
      },
      defaults: {
        status: NODE_RUN_STATUS.RUNNING,
        started_at: new Date(),
      },
      transaction: tx,
    });

    if (!created && nodeRun.status === NODE_RUN_STATUS.COMPLETED) {
      // A 'parked' nodeRun isn't really finished — the workflow is waiting
      // for an event or timeout. Don't try to advance from it; the next
      // attempt (with a different attempt number) will resume properly.
      if (nodeRun.output && nodeRun.output.parked) {
        return { skipped: "already_parked_attempt" };
      }
      // Already completed previously; advance based on its recorded output.
      return await scheduleNext({
        enrollment,
        currentNode,
        explicitNextNodeId: nodeRun.output?.chosen_next || null,
        nodes,
        edges,
        tx,
      });
    }
    if (!created && nodeRun.status === NODE_RUN_STATUS.FAILED) {
      // Reset to running for this attempt's retry.
      await nodeRun.update(
        { status: NODE_RUN_STATUS.RUNNING, started_at: new Date(), error: null },
        { transaction: tx }
      );
    }

    // 5. Dispatch to handler
    const handler = getHandler(currentNode.type);
    if (!handler) {
      await nodeRun.update(
        {
          status: NODE_RUN_STATUS.FAILED,
          finished_at: new Date(),
          error: `unknown_node_type:${currentNode.type}`,
        },
        { transaction: tx }
      );
      await failEnrollment(
        enrollment,
        `unknown_node_type:${currentNode.type}`,
        tx
      );
      return { failed: "unknown_node_type" };
    }

    let result;
    try {
      result = await handler.execute({
        enrollment,
        node: currentNode,
        workflow,
        context: enrollment.context || {},
        nodeRun,
        nodes,
        edges,
        tx,
      });
    } catch (err) {
      if (isTransientDbError(err)) {
        // Transient infrastructure blip — let BullMQ retry the whole advance
        // instead of burying the lead. Don't try to update nodeRun here: if
        // the failure was a connection drop the transaction is already dead
        // and the write would throw a new "transaction aborted" error,
        // masking the real cause. The reconcile cron + retry will create a
        // fresh node_run on the next attempt.
        throw err;
      }
      if (err && err.retryable) {
        // Handler-flagged retryable (e.g. provider 5xx). Mark this node_run
        // failed so we have a record, then rethrow for BullMQ to retry.
        await nodeRun.update(
          {
            status: NODE_RUN_STATUS.FAILED,
            finished_at: new Date(),
            error: err.message,
          },
          { transaction: tx }
        );
        throw err;
      }
      // Non-retryable → fail enrollment outright.
      await nodeRun.update(
        {
          status: NODE_RUN_STATUS.FAILED,
          finished_at: new Date(),
          error: err?.message || "handler_error",
        },
        { transaction: tx }
      );
      await failEnrollment(enrollment, err?.message || "handler_error", tx);
      return { failed: "handler_threw" };
    }

    // 6. Apply context patch
    if (result && result.context_patch && typeof result.context_patch === "object") {
      await enrollment.update(
        { context: { ...(enrollment.context || {}), ...result.context_patch } },
        { transaction: tx }
      );
    }

    // 6b. Park outcome — the handler created a waiter and set the enrollment
    // to WAITING. Mark this attempt's nodeRun completed-with-parked-flag so
    // a retried parking job doesn't try to advance from it. The actual
    // advance happens on a future attempt (timeout job or wake-from-event).
    if (result?.outcome === "park") {
      await nodeRun.update(
        {
          status: NODE_RUN_STATUS.COMPLETED,
          finished_at: new Date(),
          output: { ...(result.output || {}), parked: true },
        },
        { transaction: tx }
      );
      return { parked: true };
    }

    // 7. Mark node run terminal based on outcome
    const nodeRunStatus =
      result?.outcome === "skip"
        ? NODE_RUN_STATUS.SKIPPED
        : NODE_RUN_STATUS.COMPLETED;
    // Preserve the human-readable reason on `output.reason` so the UI can
    // surface "Skipped because: <why>" instead of just "Skipped".
    const mergedOutput = {
      ...(result?.output || {}),
      ...(result?.reason ? { reason: result.reason } : {}),
    };
    await nodeRun.update(
      {
        status: nodeRunStatus,
        finished_at: new Date(),
        output: mergedOutput,
        provider_message_id: result?.provider_message_id || null,
      },
      { transaction: tx }
    );

    // 8. Outcome routing
    if (result?.outcome === "cancel") {
      await enrollment.update(
        {
          status: ENROLLMENT_STATUS.CANCELLED,
          completed_at: new Date(),
          current_node_id: null,
          error_reason: result.reason || "cancelled_by_handler",
        },
        { transaction: tx }
      );
      return { cancelled: result.reason || "by_handler" };
    }

    if (result?.outcome === "goal") {
      await enrollment.update(
        {
          status: ENROLLMENT_STATUS.COMPLETED,
          completed_at: new Date(),
          current_node_id: null,
        },
        { transaction: tx }
      );
      return { completed: true };
    }

    // 'next' or 'skip' → schedule the next node
    return await scheduleNext({
      enrollment,
      currentNode,
      explicitNextNodeId: result?.next_node_id || null,
      nodes,
      edges,
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function failEnrollment(enrollment, reason, tx) {
  await enrollment.update(
    {
      status: ENROLLMENT_STATUS.FAILED,
      completed_at: new Date(),
      error_reason: reason,
    },
    { transaction: tx }
  );
}

/**
 * Compute the next node id and enqueue the advance job for it (after commit).
 * If the next node is a control.delay, schedule the job with the configured
 * delay so BullMQ holds it for the right duration.
 */
async function scheduleNext({
  enrollment,
  currentNode,
  explicitNextNodeId,
  nodes,
  edges,
  tx,
}) {
  const nextNodeId =
    explicitNextNodeId || pickDefaultNextNode(currentNode.id, edges);

  if (!nextNodeId) {
    await failEnrollment(enrollment, "no_next_node", tx);
    return { failed: "no_next_node" };
  }

  const nextNode = nodes.find((n) => n.id === nextNodeId);
  if (!nextNode) {
    await failEnrollment(enrollment, `unknown_next_node:${nextNodeId}`, tx);
    return { failed: "unknown_next_node" };
  }

  const delayMs =
    nextNode.type === NODE_TYPE.CONTROL_DELAY
      ? computeDelayMs(nextNode.config)
      : 0;
  const nextScheduledAt = new Date(Date.now() + delayMs);

  await enrollment.update(
    {
      current_node_id: nextNodeId,
      next_scheduled_at: nextScheduledAt,
    },
    { transaction: tx }
  );

  // Enqueue ONLY after DB commit. afterCommit is non-blocking; we log and
  // rely on the reconcile cron for the rare case where this fails.
  tx.afterCommit(() => {
    enqueueAdvance({
      enrollmentId: enrollment.id,
      nodeId: nextNodeId,
      attempt: 1,
      delayMs,
    }).catch((err) => {
      console.error(
        `[advance] enqueue next failed enr=${enrollment.id} node=${nextNodeId}:`,
        err.message
      );
    });
  });

  return {
    advanced: true,
    next: nextNodeId,
    next_scheduled_at: nextScheduledAt.toISOString(),
  };
}

module.exports = { advanceEnrollment };
