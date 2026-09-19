import {
  WORKFLOW_NODE_TYPE,
  WORKFLOW_DURATION_UNIT,
  WORKFLOW_DURATION_MS,
} from "../../../config/constants/workflow.js";

/**
 * Pause the journey for a fixed duration.
 *
 * Nothing is held in memory: the deadline is written to `enrollment.nextRunAt`
 * and a delayed job is scheduled for it. A three-day wait is a timestamp and a
 * row, which is what lets it survive a deploy, a restart, and a lost Redis.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §6.2.
 */

export const type = WORKFLOW_NODE_TYPE.WAIT;

export const label = "Wait";

export const configSchema = {
  value: { type: "number", required: true, min: 1, max: 365 },
  unit: {
    type: "string",
    required: true,
    oneOf: Object.values(WORKFLOW_DURATION_UNIT),
  },
};

/** The one place a duration becomes milliseconds. */
export const durationMs = ({ value, unit }) =>
  Number(value) * (WORKFLOW_DURATION_MS[unit] ?? 0);

/**
 * When this wait ends.
 *
 * Pure and exported for the same reason as `branch`'s `resolveWindow`, and it
 * is the same bug on the other side: **the deadline is anchored on the first
 * visit to this node, not on every one.**
 *
 * `advanceEnrollment` returns as soon as a handler parks, leaving the cursor on
 * the waiting node — so this handler is called again when the wait elapses, and
 * a version with no memory simply parked for another full duration. Every
 * journey with a wait step in it looped forever: the row kept saying "due in
 * three days", the queue kept honouring it, nothing errored, and the email
 * after the wait was never sent. Nothing in the logs said so, because from the
 * outside it is indistinguishable from a wait that has not finished yet.
 *
 * @returns {{until: Date, fresh: boolean}}
 */
export const resolveDeadline = (node, enrollment, now = Date.now()) => {
  const parked = enrollment?.context?.wait;

  if (parked?.nodeId === node.id) {
    return { until: new Date(parked.until), fresh: false };
  }

  return { until: new Date(now + durationMs(node.config ?? {})), fresh: true };
};

export const execute = async ({ enrollment, node }) => {
  const { until, fresh } = resolveDeadline(node, enrollment);

  if (!fresh && Date.now() >= until.getTime()) {
    return {
      outcome: "next",
      // Cleared, so a later wait on the same journey starts its own clock
      // rather than inheriting this one's — the same reason `branch` clears its
      // marker on the way out.
      context: { wait: null },
      output: { waitedUntil: until },
    };
  }

  /**
   * Still waiting. Park on the **original** deadline, never a fresh one.
   *
   * A woken-early enrolment — the reconcile cron rescuing a stranded row, a
   * duplicate job delivery — must land back on the same timestamp, or every
   * rescue silently extends the wait it was meant to repair.
   */
  return {
    outcome: "park",
    runAt: until,
    context: { wait: { nodeId: node.id, until: until.toISOString() } },
    output: { waitingUntil: until },
  };
};
