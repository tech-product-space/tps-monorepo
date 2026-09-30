/**
 * Workflow automation — the vocabulary.
 *
 * Full design in `../../../../WORKFLOW_AUTOMATION_PLAN.md`. Two rules this file
 * exists to hold:
 *
 * 1. **Nothing goes in `WORKFLOW_NODE_TYPE` until a handler and a config schema
 *    exist for it.** TPS carries `action.send_whatsapp` and `control.ab_split`
 *    in its enums and its TypeScript union with no implementation behind
 *    either, and they read as capability to anyone who greps. The registry in
 *    `services/workflow/nodes/index.js` is the authority; this is the
 *    vocabulary, and the two must not drift.
 * 2. **A status a row can hold must be listed here**, even before anything sets
 *    it — the partial indexes in the migrations are built from these values,
 *    and an index that misses an in-flight status silently stops enforcing.
 */

export const WORKFLOW_STATUS = Object.freeze({
  /** Editable. Enrols nobody, whatever the trigger says. */
  DRAFT: "draft",
  /** Published and enrolling. */
  ACTIVE: "active",
  /** Published, not enrolling, and nobody advances. Waits keep their original
   *  deadline — see `WORKFLOW_AUTOMATION_PLAN.md` §6.5.2. */
  PAUSED: "paused",
  /** Retired. Never deleted: the node runs are the record of what was sent. */
  ARCHIVED: "archived",
});

export const WORKFLOW_TRIGGER_TYPE = Object.freeze({
  /** Fires when a row lands in one of the five source tables (§5.1). */
  NEW_ACTIVITY: "newActivity",
  /** An admin presses Run against a campaign audience (§5.2). */
  STATIC_LIST: "staticList",
});

/** The steps a journey can be made of. */
export const WORKFLOW_NODE_TYPE = Object.freeze({
  SEND_EMAIL: "sendEmail",
  WAIT: "wait",
  /**
   * "Did they do X?" — parks the person until the event arrives or the window
   * closes, then takes the `yes` or `no` edge.
   *
   * Branches on **things that happened in the product**, never on email opens.
   * Gradient records no opens, and its own campaign plan calls the metric
   * fiction (Apple Mail pre-fetches the pixel). A dashboard number being wrong
   * is a bad number; a *journey* branching on one is a real wrong email to a
   * real person, repeatedly, that nobody traces back to Apple.
   */
  BRANCH: "branch",
  EXIT: "exit",
});

export const WORKFLOW_ENROLLMENT_STATUS = Object.freeze({
  /** Live. Either due now or waiting out a `wait` node. */
  ACTIVE: "active",
  /**
   * Parked on a `branch` node until its event arrives or its window closes.
   *
   * Distinct from ACTIVE-on-a-`wait` on purpose: a wait is a known deadline,
   * whereas this may end early the moment the person does the thing. The
   * enrolment list filters on the difference, and so does `wakeWaiters`.
   */
  WAITING: "waiting",
  /** Reached an `exit`, or ran out of steps. */
  COMPLETED: "completed",
  /** A handler threw. `endReason` carries the message. */
  FAILED: "failed",
  /** Ended early — opted out, capped, or cancelled by an admin. */
  CANCELLED: "cancelled",
});

/** The two statuses that mean "this person is mid-journey". */
export const WORKFLOW_LIVE_STATUSES = Object.freeze([
  WORKFLOW_ENROLLMENT_STATUS.ACTIVE,
  WORKFLOW_ENROLLMENT_STATUS.WAITING,
]);

export const WORKFLOW_NODE_RUN_STATUS = Object.freeze({
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
});

/**
 * Why an enrolment stopped.
 *
 * Stored on `endReason` and shown in the panel. A journey that ends is the
 * normal case, so "how did it end" is the question the enrolment list is
 * actually filtered by — `failed` and `optedOut` mean very different things and
 * a single "ended" state would hide that.
 */
export const WORKFLOW_END_REASON = Object.freeze({
  /** Hit an `exit` node. */
  GOAL: "goal",
  /** Ran off the end of the graph with no `exit`. Valid, but worth naming. */
  NO_NEXT_STEP: "noNextStep",
  /** Unsubscribed mid-journey (§8.2). */
  OPTED_OUT: "optedOut",
  /** An admin cancelled it. */
  CANCELLED: "cancelled",
  /** The workflow was archived under them. */
  WORKFLOW_ARCHIVED: "workflowArchived",
  /** A handler threw. The message is appended. */
  ERROR: "error",
});

/**
 * How somebody got in. Orthogonal to `sourceType`, which is the table their row
 * lives in — a static-list enrolment can have `sourceType: eventGuests`.
 */
export const WORKFLOW_ENROLLMENT_SOURCE = Object.freeze({
  NEW_ACTIVITY: "newActivity",
  STATIC_LIST: "staticList",
  MANUAL: "manual",
});

/**
 * Wait durations.
 *
 * No `seconds`. A journey measured in seconds is not a journey, and offering
 * the unit invites a test workflow that behaves nothing like the real one —
 * `minutes` is a low enough floor to try a sequence end to end in a lunch break.
 */
export const WORKFLOW_DURATION_UNIT = Object.freeze({
  MINUTES: "minutes",
  HOURS: "hours",
  DAYS: "days",
  WEEKS: "weeks",
});

/** Milliseconds per unit. The one place this conversion lives. */
export const WORKFLOW_DURATION_MS = Object.freeze({
  [WORKFLOW_DURATION_UNIT.MINUTES]: 60 * 1000,
  [WORKFLOW_DURATION_UNIT.HOURS]: 60 * 60 * 1000,
  [WORKFLOW_DURATION_UNIT.DAYS]: 24 * 60 * 60 * 1000,
  [WORKFLOW_DURATION_UNIT.WEEKS]: 7 * 24 * 60 * 60 * 1000,
});

/** Edge labels out of a `branch`. */
export const WORKFLOW_EDGE_LABEL = Object.freeze({
  YES: "yes",
  NO: "no",
});

/**
 * Fields a client may write.
 *
 * `status`, `currentVersion`, `publishedAt` and `lastRunAt` belong to publish,
 * pause and the runner. The same reasoning as `CAMPAIGN_EDITABLE_FIELDS`: a
 * stray field in a request body must not be able to mark a workflow active, or
 * to repoint a live workflow at a version that was never published.
 */
export const WORKFLOW_EDITABLE_FIELDS = Object.freeze([
  "name",
  "description",
  "triggerType",
  "triggerConfig",
  "definition",
  "settings",
]);

/** An empty graph — the shape `definition` defaults to. */
export const EMPTY_DEFINITION = Object.freeze({
  nodes: [],
  edges: [],
  entryNodeId: null,
});

/**
 * How many workflows one person may be live in at once.
 *
 * Default 1, and that default is the feature's main safety rail: two
 * automations that each look reasonable are five emails in a week when they
 * overlap, and neither author sees it — each looks at their own workflow and
 * sees three. Changed in the panel, not in code (§8.3).
 */
export const DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_PERSON = 1;

/**
 * Where a branch condition starts counting from.
 *
 * Bounded at **both** ends, deliberately. TPS's condition has no upper bound —
 * its own README notes that a workflow paused past the timeout still matches
 * late events — so "did they register in the five days after we asked" quietly
 * becomes "have they ever registered". Anchoring the start here and stopping at
 * the deadline in the handler means the question means what it says.
 */
export const WORKFLOW_CONDITION_SINCE = Object.freeze({
  /** The moment they entered the workflow. */
  ENROLLMENT_START: "enrollmentStart",
  /** The moment the step before this one finished — usually the email. */
  PREVIOUS_STEP: "previousStep",
});

/** Guard against a cyclic definition spinning inside one job (§6.5.1). */
export const MAX_STEPS_PER_JOB = 20;
