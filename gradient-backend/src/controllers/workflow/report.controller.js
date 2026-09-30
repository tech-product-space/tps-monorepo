import db from "../../database/postgres/models/index.js";
import {
  WORKFLOW_NODE_TYPE,
  WORKFLOW_NODE_RUN_STATUS,
  WORKFLOW_ENROLLMENT_STATUS,
  WORKFLOW_EDGE_LABEL,
  WORKFLOW_END_REASON,
} from "../../config/constants/workflow.js";
import { CONDITION_LABELS } from "../../services/workflow/conditions.js";
import { loadVersionDefinition } from "../../services/workflow/publish.service.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const { Workflow, sequelize } = db;

/**
 * What each step actually did — and, for an if/then, which way people went.
 *
 * The yes/no split has been written to `workflow_node_runs.output.answer` since
 * phase 5 and nothing read it, which is the least useful place for a number to
 * live. It is also the number that decides whether a branch was worth adding:
 * a 50/50 split is a workflow doing work, a 2/98 split is a step that could be
 * deleted, and neither is visible from the enrolment list.
 *
 * Three deliberate choices:
 *
 * 1. **Runs are counted across every version**, not just the live one. People
 *    part-way through version 2 are still being emailed by version 2, and a
 *    report that hides them is a report that disagrees with the inbox.
 * 2. **"Still waiting" comes from the enrolment rows, not from the runs.** A
 *    parked branch writes an `answer: "waiting"` run every time it is woken, so
 *    counting those would count one person several times. Who is *currently*
 *    sitting on a node is a fact about `workflow_enrollments`.
 * 3. **Nodes with runs but no place in the current definition are still
 *    listed**, marked as belonging to an earlier version. Dropping them would
 *    quietly under-report what was sent.
 */

const notFound = (res) =>
  res.status(404).json({ success: false, message: "Workflow not found" });

/** A short human label for a step, from its config. */
const describeNode = (node) => {
  const config = node?.config ?? {};

  switch (node?.type) {
    case WORKFLOW_NODE_TYPE.SEND_EMAIL:
      return config.subject?.trim() || "No subject";

    case WORKFLOW_NODE_TYPE.WAIT: {
      const value = Number(config.value) || 0;
      const unit = String(config.unit ?? "").replace(/s$/, "");
      return `${value} ${unit}${value === 1 ? "" : "s"}`;
    }

    case WORKFLOW_NODE_TYPE.BRANCH:
      return CONDITION_LABELS[config.eventType] ?? config.eventType ?? "If / then";

    case WORKFLOW_NODE_TYPE.EXIT:
      return config.reason || "completed";

    default:
      return "";
  }
};

export const getWorkflowReport = asyncWrapper(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) return notFound(res);

  /**
   * The published version if there is one, the draft otherwise.
   *
   * A draft has no runs, so the report is empty rather than wrong — and an
   * empty report on an unpublished workflow is the correct answer.
   */
  const definition =
    (workflow.currentVersion
      ? await loadVersionDefinition(workflow.id, workflow.currentVersion)
      : null) ?? workflow.definition;

  const [runRows, whereTheyAre, outcomes] = await Promise.all([
    sequelize.query(
      `SELECT r."nodeId",
              r."nodeType",
              r.status,
              r.output->>'answer' AS answer,
              COUNT(*)::int AS runs,
              COUNT(DISTINCT r."enrollmentId")::int AS people
         FROM workflow_node_runs r
         JOIN workflow_enrollments e ON e.id = r."enrollmentId"
        WHERE e."workflowId" = :workflowId
        GROUP BY r."nodeId", r."nodeType", r.status, r.output->>'answer'`,
      {
        replacements: { workflowId: workflow.id },
        type: sequelize.QueryTypes.SELECT,
      },
    ),

    // Where the live ones are sitting right now.
    sequelize.query(
      `SELECT "currentNodeId" AS "nodeId", status, COUNT(*)::int AS count
         FROM workflow_enrollments
        WHERE "workflowId" = :workflowId
          AND status IN (:live)
          AND "currentNodeId" IS NOT NULL
        GROUP BY "currentNodeId", status`,
      {
        replacements: {
          workflowId: workflow.id,
          live: [
            WORKFLOW_ENROLLMENT_STATUS.ACTIVE,
            WORKFLOW_ENROLLMENT_STATUS.WAITING,
          ],
        },
        type: sequelize.QueryTypes.SELECT,
      },
    ),

    sequelize.query(
      `SELECT status, "endReason", COUNT(*)::int AS count
         FROM workflow_enrollments
        WHERE "workflowId" = :workflowId
        GROUP BY status, "endReason"`,
      {
        replacements: { workflowId: workflow.id },
        type: sequelize.QueryTypes.SELECT,
      },
    ),
  ]);

  /* ── fold the run rows into one entry per node ── */

  const blank = (nodeId, nodeType) => ({
    nodeId,
    nodeType,
    label: "",
    /** Distinct people who reached this step. */
    reached: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    /** Live enrolments sitting on it right now. */
    hereNow: 0,
    /** Only populated for a branch. */
    branch: null,
    /** True when the node ran under a version this workflow no longer uses. */
    retired: false,
  });

  const byNode = new Map();

  for (const row of runRows) {
    const entry = byNode.get(row.nodeId) ?? blank(row.nodeId, row.nodeType);

    // Distinct-per-group summed across groups over-counts anyone who ran the
    // node twice — a retried email, or a branch woken and then resolved. The
    // max is the honest floor and never exceeds the true number.
    entry.reached = Math.max(entry.reached, row.people);

    if (row.status === WORKFLOW_NODE_RUN_STATUS.COMPLETED) {
      entry.completed += row.runs;
    } else if (row.status === WORKFLOW_NODE_RUN_STATUS.FAILED) {
      entry.failed += row.runs;
    } else if (row.status === WORKFLOW_NODE_RUN_STATUS.SKIPPED) {
      entry.skipped += row.runs;
    }

    if (row.nodeType === WORKFLOW_NODE_TYPE.BRANCH) {
      entry.branch = entry.branch ?? { yes: 0, no: 0, waiting: 0, yesRate: null };

      if (row.answer === WORKFLOW_EDGE_LABEL.YES) entry.branch.yes += row.people;
      if (row.answer === WORKFLOW_EDGE_LABEL.NO) entry.branch.no += row.people;
    }

    byNode.set(row.nodeId, entry);
  }

  for (const row of whereTheyAre) {
    const entry = byNode.get(row.nodeId);
    if (!entry) continue;

    entry.hereNow += row.count;

    // Only a `waiting` enrolment on a branch is genuinely undecided; an
    // `active` one is between steps and about to be answered.
    if (
      entry.nodeType === WORKFLOW_NODE_TYPE.BRANCH &&
      row.status === WORKFLOW_ENROLLMENT_STATUS.WAITING
    ) {
      entry.branch = entry.branch ?? { yes: 0, no: 0, waiting: 0, yesRate: null };
      entry.branch.waiting += row.count;
    }
  }

  /* ── order them the way the journey runs, and name them ── */

  const nodes = definition?.nodes ?? [];
  const order = new Map(nodes.map((n, i) => [n.id, i]));

  for (const node of nodes) {
    const entry = byNode.get(node.id) ?? blank(node.id, node.type);
    entry.label = describeNode(node);
    byNode.set(node.id, entry);
  }

  const report = [...byNode.values()]
    .map((entry) => {
      if (!order.has(entry.nodeId)) entry.retired = true;

      if (entry.branch) {
        const decided = entry.branch.yes + entry.branch.no;
        // Null rather than zero while nobody has been through: "0%" and "no
        // data yet" are different answers and only one of them is a problem.
        entry.branch.yesRate = decided ? entry.branch.yes / decided : null;
      }

      return entry;
    })
    .sort(
      (a, b) =>
        (order.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER),
    );

  /* ── the totals along the top ── */

  const totalBy = (predicate) =>
    outcomes.filter(predicate).reduce((sum, r) => sum + r.count, 0);

  return res.json({
    success: true,
    data: {
      version: workflow.currentVersion,
      generatedAt: new Date(),
      totals: {
        enrolled: totalBy(() => true),
        live: totalBy((r) =>
          [
            WORKFLOW_ENROLLMENT_STATUS.ACTIVE,
            WORKFLOW_ENROLLMENT_STATUS.WAITING,
          ].includes(r.status),
        ),
        completed: totalBy(
          (r) => r.status === WORKFLOW_ENROLLMENT_STATUS.COMPLETED,
        ),
        failed: totalBy((r) => r.status === WORKFLOW_ENROLLMENT_STATUS.FAILED),
        cancelled: totalBy(
          (r) => r.status === WORKFLOW_ENROLLMENT_STATUS.CANCELLED,
        ),
        // Broken out because it is the one outcome worth acting on: people are
        // leaving mid-journey and the step before is where to look.
        optedOut: totalBy((r) => r.endReason === WORKFLOW_END_REASON.OPTED_OUT),
      },
      nodes: report,
    },
  });
});
