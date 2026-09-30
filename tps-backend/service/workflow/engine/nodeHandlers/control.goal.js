"use strict";

const { recordLeadEvent } = require("../../events/recordLeadEvent");
const { LEAD_EVENT_TYPE } = require("../../../../constants/workflow");

/**
 * Goal node: marks the enrollment as completed and emits a goal.reached
 * lead_event so other workflows can read it via a control.condition.
 *
 * The event recording runs after the parent transaction commits to keep
 * event-write failures from corrupting the workflow advance.
 */
exports.execute = async ({ enrollment, node, nodeRun, tx }) => {
  const goalName = node.config?.goal_name || "completed";

  if (tx && typeof tx.afterCommit === "function") {
    tx.afterCommit(() => {
      recordLeadEvent({
        leadSourceType: enrollment.lead_source_type,
        leadSourceId: enrollment.lead_source_id,
        eventType: LEAD_EVENT_TYPE.GOAL_REACHED,
        enrollmentId: enrollment.id,
        workflowNodeRunId: nodeRun?.id,
        payload: { goal_name: goalName, workflow_id: enrollment.workflow_id },
        dedupeKey: `goal:${enrollment.id}:${node.id}`,
      }).catch((err) =>
        console.error("post-goal recordLeadEvent failed:", err.message)
      );
    });
  }

  return {
    outcome: "goal",
    output: { goal_name: goalName },
  };
};
