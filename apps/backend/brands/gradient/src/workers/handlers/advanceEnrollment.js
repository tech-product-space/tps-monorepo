import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_STATUS,
  WORKFLOW_NODE_TYPE,
  WORKFLOW_ENROLLMENT_STATUS,
  WORKFLOW_LIVE_STATUSES,
  WORKFLOW_NODE_RUN_STATUS,
  WORKFLOW_END_REASON,
  MAX_STEPS_PER_JOB,
} from "../../config/constants/workflow.js";
import { getNodeHandler } from "../../services/workflow/nodes/index.js";
import { loadVersionDefinition } from "../../services/workflow/publish.service.js";
import { enqueueAdvance, removeAdvanceJob } from "../../queues/workflowQueues.js";
import logger from "../../util/logger.js";

const { Workflow, WorkflowEnrollment, WorkflowNodeRun, sequelize } = db;

/**
 * Move one enrolment as far along its journey as it can go right now.
 *
 * One job is one enrolment. The loop runs until the journey parks on a wait,
 * terminates, or hits `MAX_STEPS_PER_JOB`.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §6.5.
 */

/**
 * Merges a handler's context patch into the enrolment's.
 *
 * A `null` value **deletes** the key rather than storing null — a branch clears
 * its own marker on the way out, so a second branch later in the same journey
 * starts a fresh window instead of inheriting the first one's deadline.
 */
const mergeContext = (enrollment, patch) => {
  const next = { ...(enrollment.context ?? {}) };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }

  return next;
};

/** The next node along, honouring an edge label when the handler asked for one. */
const nextNodeId = (definition, fromId, label) => {
  const edges = definition?.edges ?? [];

  if (label) {
    const labelled = edges.find((e) => e.from === fromId && e.label === label);
    if (labelled) return labelled.to;
  }

  return edges.find((e) => e.from === fromId && !e.label)?.to ?? null;
};

const terminate = async (enrollment, status, reason) =>
  enrollment.update({
    status,
    endReason: reason,
    completedAt: new Date(),
    // Cleared together, always. A terminated row with a due time is what the
    // reconcile cron picks back up.
    nextRunAt: null,
    jobId: null,
  });

/**
 * @param {import("bullmq").Job} job `{ enrollmentId }`
 */
export const advanceEnrollment = async (job) => {
  const { enrollmentId } = job.data;

  /**
   * Read the row and check it is still live.
   *
   * **This is not the idempotency defence, and it must not be mistaken for
   * one.** It used to claim to be: a `SELECT … FOR UPDATE` in a transaction
   * that commits before the handlers run. Releasing a lock and *then* doing the
   * work it was meant to protect is no lock at all — the claim mutates nothing,
   * so a second job reads identical state and both proceed. The end-to-end run
   * demonstrated it by delivering two jobs for one enrolment and putting two
   * copies of the same email in one inbox.
   *
   * What this does buy is real, just smaller: an enrolment cancelled,
   * completed or opted out between the job being scheduled and it being picked
   * up is dropped here rather than advanced. That is also why cancel clears
   * `jobId` on a best-effort basis rather than a guaranteed one.
   *
   * The actual defence is the unique index on
   * `(enrollmentId, nodeId, attempt)`, enforced where the node run is created
   * below, plus `sendEmail`'s own check for a send it already made.
   */
  const claimed = await sequelize.transaction(async (t) => {
    const enrollment = await WorkflowEnrollment.findByPk(enrollmentId, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!enrollment) return null;

    // Cancelled, completed, or opted out between the job being scheduled and
    // it being picked up. Normal, and the reason cancel clears `jobId` on a
    // best-effort basis rather than a guaranteed one.
    if (!WORKFLOW_LIVE_STATUSES.includes(enrollment.status)) return null;

    return enrollment;
  });

  if (!claimed) return { skipped: true };

  const workflow = await Workflow.findByPk(claimed.workflowId);

  if (!workflow) {
    await terminate(
      claimed,
      WORKFLOW_ENROLLMENT_STATUS.FAILED,
      `${WORKFLOW_END_REASON.ERROR}:workflow missing`,
    );
    return { failed: true };
  }

  /**
   * A paused workflow leaves the row exactly as it is.
   *
   * No advance, no failure, no touching `nextRunAt`. Resume re-queues from the
   * stored deadline, so the wait window is not extended by the length of the
   * pause. TPS instead throws a retryable error and lets the queue hold the
   * job, which does extend it — see §6.5.2.
   */
  if (workflow.status === WORKFLOW_STATUS.PAUSED) {
    return { paused: true };
  }

  if (workflow.status === WORKFLOW_STATUS.ARCHIVED) {
    await terminate(
      claimed,
      WORKFLOW_ENROLLMENT_STATUS.CANCELLED,
      WORKFLOW_END_REASON.WORKFLOW_ARCHIVED,
    );
    return { cancelled: true };
  }

  /**
   * The frozen version they joined on — never `workflow.definition`, which is
   * the draft and moves under them.
   */
  const definition = await loadVersionDefinition(
    claimed.workflowId,
    claimed.workflowVersion,
  );

  if (!definition) {
    await terminate(
      claimed,
      WORKFLOW_ENROLLMENT_STATUS.FAILED,
      `${WORKFLOW_END_REASON.ERROR}:version ${claimed.workflowVersion} not found`,
    );
    return { failed: true };
  }

  let enrollment = claimed;
  let steps = 0;

  /**
   * Writes the enrolment forward **only if it is still live.**
   *
   * The status is checked once, when the job claims the enrolment. Everything
   * after that — the send, the park, the walk to the next node — happens
   * outside any lock, and an unsubscribe or an admin cancel can land in the
   * middle of it. Two things went wrong when it did:
   *
   * 1. A park wrote `nextRunAt` and `jobId` back onto a row that had just been
   *    cancelled, so a finished journey sat there claiming to be due, with a
   *    delayed job behind it that would fire days later and do nothing.
   * 2. Worse, the walk to the next node writes `status: active`. A cancel that
   *    landed mid-step was **overwritten back to active**, and the journey
   *    carried on sending. Unsubscribes happened to survive that, because the
   *    dispatcher refuses a suppressed address — but an admin cancel has no
   *    such backstop, and that is the case this was found by.
   *
   * Making the update conditional turns both into a no-op: the `WHERE` misses,
   * nothing is written, and the job stops where it is.
   */
  const advanceIfLive = async (values) => {
    const [rows] = await WorkflowEnrollment.update(values, {
      where: {
        id: enrollment.id,
        status: { [Op.in]: WORKFLOW_LIVE_STATUSES },
      },
    });

    return rows > 0;
  };

  const endedUnderneath = () => {
    logger.info("Enrolment ended mid-step, stopping where it is", {
      enrollmentId: enrollment.id,
      nodeId: enrollment.currentNodeId,
    });

    return { endedMidStep: true, steps };
  };

  while (steps < MAX_STEPS_PER_JOB) {
    steps += 1;

    const node = definition.nodes?.find((n) => n.id === enrollment.currentNodeId);

    // Ran off the end, or the cursor points at a node this version does not
    // have. Both are terminal, and `noNextStep` says which without pretending
    // the person reached a goal.
    if (!node) {
      await terminate(
        enrollment,
        WORKFLOW_ENROLLMENT_STATUS.COMPLETED,
        WORKFLOW_END_REASON.NO_NEXT_STEP,
      );
      return { completed: true, steps };
    }

    const handler = getNodeHandler(node.type);

    if (!handler) {
      // Named, not silent. Publish validation makes this near-impossible, but
      // an old version frozen before a node type was removed would land here.
      await terminate(
        enrollment,
        WORKFLOW_ENROLLMENT_STATUS.FAILED,
        `${WORKFLOW_END_REASON.ERROR}:no handler for "${node.type}"`,
      );
      return { failed: true, steps };
    }

    /**
     * The run row opens before the handler and closes after — and creating it
     * **is** the claim.
     *
     * The unique index on `(enrollmentId, nodeId, jobId, attempt)` makes the
     * database the arbiter. The same delivery of the same job arriving twice
     * matches on all four columns and exactly one insert survives; the loser
     * stops here, before its handler runs and before anything is sent.
     *
     * **`jobId` is in the key for a reason.** Without it the key could not tell
     * a duplicate from a second, legitimate visit to a node — which is what a
     * wait is, since it parks on one job and resumes on another, and both carry
     * `attemptsMade = 0`. Keyed on the node alone, every resume in the product
     * was rejected as a duplicate and every wait parked forever.
     *
     * A BullMQ retry of the same job carries a higher `attemptsMade` and is
     * deliberately let through, because a step that really failed must be
     * retried. The narrower window that leaves — a retry after SES accepted the
     * message but before the row was written — is closed inside
     * `sendEmail.execute`, which refuses to send a second time for a node whose
     * run already carries a provider message id.
     */
    let nodeRun;

    /** Set when the claim collides with a send step that is already finished. */
    let settledSend = null;

    try {
      nodeRun = await WorkflowNodeRun.create({
        enrollmentId: enrollment.id,
        nodeId: node.id,
        nodeType: node.type,
        jobId: job.id ?? null,
        attempt: job.attemptsMade + 1,
        status: WORKFLOW_NODE_RUN_STATUS.RUNNING,
        startedAt: new Date(),
      });
    } catch (error) {
      if (error.name !== "SequelizeUniqueConstraintError") throw error;

      /**
       * Two indexes can refuse this insert, and they mean different things.
       *
       * The narrow one — same job, same attempt — is a redelivery, and there is
       * nothing to do. The partial one on send steps is the interesting case:
       * some *other* job already owns this send. If that job is still running,
       * this one must get out of the way. If it finished, the email has already
       * gone out, and dropping this job would leave the person parked forever
       * on a step that is complete — so it walks on instead of sending again.
       */
      settledSend = await WorkflowNodeRun.findOne({
        where: {
          enrollmentId: enrollment.id,
          nodeId: node.id,
          nodeType: WORKFLOW_NODE_TYPE.SEND_EMAIL,
          status: [
            WORKFLOW_NODE_RUN_STATUS.COMPLETED,
            WORKFLOW_NODE_RUN_STATUS.SKIPPED,
          ],
        },
      });

      if (!settledSend) {
        logger.info("Duplicate advance job dropped", {
          enrollmentId: enrollment.id,
          nodeId: node.id,
          attempt: job.attemptsMade + 1,
        });

        return { duplicate: true, steps };
      }

      logger.info("Send already completed for this step, walking on", {
        enrollmentId: enrollment.id,
        nodeId: node.id,
        providerMessageId: settledSend.providerMessageId,
      });
    }

    let result;

    if (settledSend) {
      /**
       * Deliberately no `nodeRun.update` here. The existing row already records
       * the send that happened, provider message id and all, and rewriting it
       * from this job would overwrite that id with null.
       */
      result = { outcome: "next" };
    } else {
      try {
        result = await handler.execute({ enrollment, node, workflow, nodeRun });
      } catch (error) {
        await nodeRun.update({
          status: WORKFLOW_NODE_RUN_STATUS.FAILED,
          finishedAt: new Date(),
          error: error.message?.slice(0, 1000),
        });

        /**
         * One bad node config fails one enrolment, never the batch.
         *
         * Rethrown so BullMQ records the failure and applies its backoff — a
         * thrown error here is unexpected, and unexpected is worth retrying. A
         * handler that knows its failure is permanent returns `outcome: "fail",
         * retryable: false` instead of throwing.
         */
        await terminate(
          enrollment,
          WORKFLOW_ENROLLMENT_STATUS.FAILED,
          `${WORKFLOW_END_REASON.ERROR}:${error.message}`,
        );

        logger.error("Workflow node threw", {
          enrollmentId: enrollment.id,
          nodeId: node.id,
          nodeType: node.type,
          error: error.message,
        });

        throw error;
      }

      await nodeRun.update({
        status:
          result.outcome === "skip"
            ? WORKFLOW_NODE_RUN_STATUS.SKIPPED
            : WORKFLOW_NODE_RUN_STATUS.COMPLETED,
        finishedAt: new Date(),
        output: result.output ?? {},
        providerMessageId: result.providerMessageId ?? null,
      });
    }

    /* ── what the handler decided ── */

    if (result.outcome === "stop") {
      const failed = String(result.reason ?? "").startsWith(
        WORKFLOW_END_REASON.ERROR,
      );

      await terminate(
        enrollment,
        failed
          ? WORKFLOW_ENROLLMENT_STATUS.FAILED
          : result.reason === WORKFLOW_END_REASON.OPTED_OUT
            ? WORKFLOW_ENROLLMENT_STATUS.CANCELLED
            : WORKFLOW_ENROLLMENT_STATUS.COMPLETED,
        result.reason ?? WORKFLOW_END_REASON.GOAL,
      );

      return { stopped: true, reason: result.reason, steps };
    }

    if (result.outcome === "fail") {
      await nodeRun.update({
        status: WORKFLOW_NODE_RUN_STATUS.FAILED,
        error: result.reason?.slice(0, 1000),
      });

      if (result.retryable === false) {
        await terminate(
          enrollment,
          WORKFLOW_ENROLLMENT_STATUS.FAILED,
          `${WORKFLOW_END_REASON.ERROR}:${result.reason}`,
        );
        return { failed: true, steps };
      }

      // Retryable: leave the enrolment live and let BullMQ's backoff bring the
      // job back. The row still says where it is, so the retry resumes at the
      // same node rather than restarting the journey.
      throw Object.assign(new Error(result.reason || "Step failed"), {
        retryable: true,
      });
    }

    if (result.outcome === "park") {
      const runAt = result.runAt ?? new Date();

      // The column first, then the job. If the process dies between the two,
      // the reconcile cron finds an overdue enrolment with no live job and
      // re-queues it — which is the failure this ordering is chosen for.
      const parked = await advanceIfLive({
        nextRunAt: runAt,
        // A branch parks as WAITING rather than ACTIVE, so the enrolment list
        // can tell "counting down a wait" from "waiting to see what they do".
        ...(result.status ? { status: result.status } : {}),
        ...(result.context ? { context: mergeContext(enrollment, result.context) } : {}),
      });

      if (!parked) return endedUnderneath();

      const next = await enqueueAdvance(enrollment.id, { runAt });

      if (next?.id) {
        // And once more, because the cancel may have arrived in the gap. A job
        // whose id never reaches the row is one nothing will ever clean up, so
        // it is withdrawn here rather than left to fire into a cancelled
        // enrolment weeks later.
        const kept = await advanceIfLive({ jobId: next.id });

        if (!kept) {
          await removeAdvanceJob(next.id);
          return endedUnderneath();
        }
      }

      return { parked: true, runAt, steps };
    }

    /* ── outcome: "next" / "skip" — walk the edge ── */
    const targetId = nextNodeId(definition, node.id, result.edgeLabel);

    if (!targetId) {
      await terminate(
        enrollment,
        WORKFLOW_ENROLLMENT_STATUS.COMPLETED,
        WORKFLOW_END_REASON.NO_NEXT_STEP,
      );
      return { completed: true, steps };
    }

    const walked = await advanceIfLive({
      currentNodeId: targetId,
      // Back to ACTIVE: a branch that resolved is no longer waiting on anybody.
      // Conditional, because on a cancelled row this line is what used to bring
      // the journey back to life.
      status: WORKFLOW_ENROLLMENT_STATUS.ACTIVE,
      ...(result.context ? { context: mergeContext(enrollment, result.context) } : {}),
    });

    if (!walked) return endedUnderneath();

    enrollment = await enrollment.reload();
  }

  /**
   * Hit the step ceiling.
   *
   * The publish validator rejects cycles, so this should be unreachable — it is
   * the belt to that braces, because a runaway loop that sends email is worth
   * defending against twice. Re-queued rather than failed: a genuinely long but
   * finite chain continues on the next job.
   */
  logger.warn("Enrolment hit the step ceiling in one job", {
    enrollmentId: enrollment.id,
    steps,
  });

  await enrollment.update({ nextRunAt: new Date() });

  const next = await enqueueAdvance(enrollment.id, { delay: 1_000 });

  if (next?.id) await enrollment.update({ jobId: next.id });

  return { requeued: true, steps };
};
