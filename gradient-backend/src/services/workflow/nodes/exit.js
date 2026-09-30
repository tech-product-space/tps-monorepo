import {
  WORKFLOW_NODE_TYPE,
  WORKFLOW_END_REASON,
} from "../../../config/constants/workflow.js";

/**
 * End the journey, successfully.
 *
 * A workflow is allowed to run off the end of its graph, and that terminates an
 * enrolment too — but with `noNextStep` rather than `goal`. Keeping the two
 * apart is the difference between "they finished" and "the graph stopped", and
 * only one of those is a result worth reporting.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §6.2.
 */

export const type = WORKFLOW_NODE_TYPE.EXIT;

export const label = "Exit";

export const configSchema = {
  /** Free text, shown in reporting: "completed", "booked a call". */
  reason: { type: "string", required: false, maxLength: 120 },
};

export const execute = async ({ node }) => ({
  outcome: "stop",
  reason: WORKFLOW_END_REASON.GOAL,
  output: { goal: node.config?.reason || "completed" },
});
