import { WORKFLOW_NODE_TYPE } from "../../../config/constants/workflow.js";

import * as sendEmail from "./sendEmail.js";
import * as wait from "./wait.js";
import * as branch from "./branch.js";
import * as exitNode from "./exit.js";

/**
 * The authority on which steps actually work.
 *
 * `WORKFLOW_NODE_TYPE` is the vocabulary; this is the implementation — the same
 * split as `CAMPAIGN_SOURCE_TYPE` and the recipient resolver registry, and for
 * the same reason. A node type in the enum with nothing here must produce a
 * **named publish-time error**, never a step that silently does nothing. "That
 * step does not exist" and "that step did nothing" must not look the same to
 * whoever is staring at a journey that ended early.
 *
 * Adding a step type is: a constant, a file here exporting
 * `{ type, label, configSchema, execute }`, a line in this map, and a UI piece.
 * If it sends something, a dispatcher under `../dispatch/` too.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §6.3.
 */
export const NODE_HANDLERS = Object.freeze({
  [WORKFLOW_NODE_TYPE.SEND_EMAIL]: sendEmail,
  [WORKFLOW_NODE_TYPE.WAIT]: wait,
  [WORKFLOW_NODE_TYPE.BRANCH]: branch,
  [WORKFLOW_NODE_TYPE.EXIT]: exitNode,
});

export const SUPPORTED_NODE_TYPES = Object.freeze(Object.keys(NODE_HANDLERS));

export const isSupportedNodeType = (type) =>
  Object.prototype.hasOwnProperty.call(NODE_HANDLERS, type);

/**
 * The handler for a node type, or null.
 *
 * Returns null rather than throwing: the validator turns it into a readable
 * error naming the node, and the runner turns it into a failed enrolment with
 * a reason. Both are better than a stack trace.
 */
export const getNodeHandler = (type) => NODE_HANDLERS[type] ?? null;

/**
 * Steps that actually send something to a person.
 *
 * Used by the validator's "a workflow that sends nothing is a mistake" rule,
 * and by the future check that two sends cannot sit next to each other with no
 * wait between them.
 */
export const SENDING_NODE_TYPES = Object.freeze([WORKFLOW_NODE_TYPE.SEND_EMAIL]);
