import { Op } from "sequelize";

import { LEAD_EVENT_TYPE, LEAD_EVENT_LABEL } from "../../config/constants/leadEvent.js";
import {
  WORKFLOW_CONDITION_SINCE,
  WORKFLOW_DURATION_MS,
  WORKFLOW_DURATION_UNIT,
} from "../../config/constants/workflow.js";

/**
 * "Did this person do X, in the window we asked about?"
 *
 * One query over `lead_events`, and nothing else. That is the whole reason the
 * activity stream exists as its own table: every branch condition reads the
 * same rows in the same shape, rather than each one knowing which of a dozen
 * product tables answers its particular question.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §7.
 */

const getModels = async () =>
  (await import("../../database/postgres/models/index.js")).default;

/**
 * Events a branch may ask about.
 *
 * `email.sent` is excluded: branching on an email *we* sent is asking whether
 * the previous step ran, which the graph already guarantees. Everything else is
 * something the person did.
 */
export const CONDITION_EVENT_TYPES = Object.freeze(
  Object.values(LEAD_EVENT_TYPE).filter(
    (type) => type !== LEAD_EVENT_TYPE.EMAIL_SENT,
  ),
);

/** Phrased as a question, because that is how it reads in the editor. */
export const CONDITION_LABELS = Object.freeze(
  Object.fromEntries(
    CONDITION_EVENT_TYPES.map((type) => [type, LEAD_EVENT_LABEL[type] ?? type]),
  ),
);

export const conditionWindowMs = (timeout) =>
  Number(timeout?.value ?? 0) *
  (WORKFLOW_DURATION_MS[timeout?.unit] ?? WORKFLOW_DURATION_MS[WORKFLOW_DURATION_UNIT.DAYS]);

/**
 * When the window opened for this enrolment.
 *
 * `previousStep` is the useful default — "did they register in the five days
 * after we emailed them" is the question people actually mean, and anchoring to
 * enrolment instead would count the days before the email went out.
 */
export const conditionSince = (condition, enrollment) => {
  if (condition?.since === WORKFLOW_CONDITION_SINCE.ENROLLMENT_START) {
    return new Date(enrollment.enrolledAt);
  }

  // Written by the branch handler when it first parks. Falling back to
  // enrolment rather than to now: a missing marker must widen the window, never
  // narrow it to nothing and answer "no" for somebody who did the thing.
  const parked = enrollment.context?.branch?.since;

  return parked ? new Date(parked) : new Date(enrollment.enrolledAt);
};

/**
 * Has it happened yet?
 *
 * Bounded at both ends. TPS checks only `occurred_at >= waiterCreatedAt`, which
 * its own README flags: a workflow paused past its timeout still matches late
 * events, so the question silently becomes "have they ever". Here the deadline
 * is part of the query, so a `no` stays `no`.
 *
 * @returns {Promise<{matched: boolean, event?: object}>}
 */
export const evaluateCondition = async (condition, enrollment, deadline) => {
  const { LeadEvent } = await getModels();

  const since = conditionSince(condition, enrollment);

  const where = {
    email: enrollment.email,
    eventType: condition.eventType,
    occurredAt: {
      [Op.gte]: since,
      ...(deadline ? { [Op.lte]: deadline } : {}),
    },
  };

  /**
   * Narrowing to a specific event or course.
   *
   * JSONB containment, which the `lead_events_metadata_gin` index answers
   * directly. An empty or absent `match` narrows nothing — the same wildcard
   * rule the trigger matchers follow, so "I did not narrow it" never silently
   * means "match nothing".
   */
  const match = condition?.match ?? {};
  const narrowed = Object.fromEntries(
    Object.entries(match).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );

  if (Object.keys(narrowed).length) {
    where.metadata = { [Op.contains]: narrowed };
  }

  const event = await LeadEvent.findOne({
    where,
    order: [["occurredAt", "ASC"]],
    attributes: ["id", "eventType", "occurredAt", "metadata"],
  });

  return { matched: Boolean(event), event: event ?? null };
};
