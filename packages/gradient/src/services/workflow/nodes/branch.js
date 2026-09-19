import {
  WORKFLOW_NODE_TYPE,
  WORKFLOW_EDGE_LABEL,
  WORKFLOW_CONDITION_SINCE,
  WORKFLOW_DURATION_UNIT,
  WORKFLOW_ENROLLMENT_STATUS,
} from "../../../config/constants/workflow.js";
import {
  CONDITION_EVENT_TYPES,
  conditionWindowMs,
  evaluateCondition,
} from "../conditions.js";

/**
 * "Did they do X?" — the if/then step.
 *
 * Three outcomes, and the middle one is what makes it more than a wait:
 *
 * - the event has already happened → `yes`, immediately
 * - the window has closed without it → `no`
 * - neither yet → **park**, and get woken the moment it happens
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §7.
 */

export const type = WORKFLOW_NODE_TYPE.BRANCH;

export const label = "If / then";

export const configSchema = {
  eventType: {
    type: "string",
    required: true,
    oneOf: CONDITION_EVENT_TYPES,
  },
  since: {
    type: "string",
    required: false,
    oneOf: Object.values(WORKFLOW_CONDITION_SINCE),
  },
  timeoutValue: { type: "number", required: true, min: 1, max: 365 },
  timeoutUnit: {
    type: "string",
    required: true,
    oneOf: Object.values(WORKFLOW_DURATION_UNIT),
  },
};

/**
 * Both edges are required by the validator, so a `no` always has somewhere to
 * go. A branch with only a `yes` would silently end the journey for everybody
 * who did not do the thing — which is most people, and is exactly the group the
 * follow-up was written for.
 */
export const requiredEdgeLabels = Object.freeze([
  WORKFLOW_EDGE_LABEL.YES,
  WORKFLOW_EDGE_LABEL.NO,
]);

/**
 * When this branch's window opened and when it closes.
 *
 * Pure, and exported, because it is the part with a real bug in it if it is
 * wrong: **the window is anchored on the first visit to this node, not on every
 * one.** A parked enrolment is re-advanced every time a matching event lands
 * for that person, so re-anchoring on each pass would push the deadline forward
 * each time — a five-day window that never expires, and a `no` branch that
 * never fires.
 *
 * @returns {{since: Date, deadline: Date, fresh: boolean}}
 */
export const resolveWindow = (node, enrollment, now = Date.now()) => {
  const config = node.config ?? {};
  const parked = enrollment?.context?.branch;

  if (parked?.nodeId === node.id) {
    return {
      since: new Date(parked.since),
      deadline: new Date(parked.deadline),
      fresh: false,
    };
  }

  return {
    since: new Date(now),
    deadline: new Date(
      now +
        conditionWindowMs({
          value: config.timeoutValue,
          unit: config.timeoutUnit,
        }),
    ),
    fresh: true,
  };
};

export const execute = async ({ enrollment, node }) => {
  const config = node.config ?? {};

  const condition = {
    eventType: config.eventType,
    since: config.since ?? WORKFLOW_CONDITION_SINCE.PREVIOUS_STEP,
    match: config.match ?? {},
  };

  const { since, deadline } = resolveWindow(node, enrollment);

  const { matched, event } = await evaluateCondition(
    condition,
    // The stored marker wins over `enrolledAt` for a `previousStep` anchor.
    { ...(enrollment.toJSON?.() ?? enrollment), context: { branch: { since } } },
    deadline,
  );

  if (matched) {
    return {
      outcome: "next",
      edgeLabel: WORKFLOW_EDGE_LABEL.YES,
      // Clears the marker, so a later branch on the same journey starts its own
      // window rather than inheriting this one.
      context: { branch: null },
      output: {
        answer: "yes",
        eventType: condition.eventType,
        matchedAt: event?.occurredAt ?? null,
      },
    };
  }

  if (Date.now() >= deadline.getTime()) {
    return {
      outcome: "next",
      edgeLabel: WORKFLOW_EDGE_LABEL.NO,
      context: { branch: null },
      output: { answer: "no", eventType: condition.eventType },
    };
  }

  /**
   * Still open. Park with a hard deadline **and** stay wakeable.
   *
   * The scheduled advance at the deadline is the guarantee: even if no event
   * ever arrives, and even if the wake path fails entirely, this enrolment is
   * looked at again and takes the `no` edge. `wakeWaiters` only ever makes that
   * happen *sooner*, never at all — which is why a missed wake is a late email
   * rather than a lost person.
   */
  return {
    outcome: "park",
    status: WORKFLOW_ENROLLMENT_STATUS.WAITING,
    runAt: deadline,
    context: {
      branch: {
        nodeId: node.id,
        since: since.toISOString(),
        deadline: deadline.toISOString(),
        eventType: condition.eventType,
      },
    },
    output: { answer: "waiting", until: deadline },
  };
};
