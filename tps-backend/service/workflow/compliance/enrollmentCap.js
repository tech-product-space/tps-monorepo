"use strict";

const {
  WorkflowEnrollment,
  sequelize,
} = require("../../../models");
const { ENROLLMENT_STATUS } = require("../../../constants/workflow");
const {
  getGlobalSettings,
  DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD,
} = require("../settings/globalSettings");
const { buildIdentityOr } = require("./identityMatch");

// Statuses that count toward the "currently in a workflow" tally. PAUSED
// and WAITING count because the workflow will resume; COMPLETED / FAILED /
// CANCELLED don't because those leads have left the workflow.
const ACTIVE_LIKE_STATUSES = [
  ENROLLMENT_STATUS.ACTIVE,
  ENROLLMENT_STATUS.PAUSED,
  ENROLLMENT_STATUS.WAITING,
];

async function resolveCap() {
  try {
    const settings = await getGlobalSettings();
    const v = settings?.max_active_workflows_per_lead;
    if (Number.isInteger(v) && v >= 1) return v;
  } catch (err) {
    console.error(
      "enrollmentCap.resolveCap: failed to read settings:",
      err.message
    );
  }
  return DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD;
}

/**
 * Count how many DISTINCT workflows a single lead (identified by email or
 * phone) is currently active/paused in, EXCLUDING the workflow we're about
 * to enroll them in.
 *
 * Identity-first dedupe: the same person who arrives via different sources
 * (e.g. (platform_leads, 100) and (events, 200)) shares email/phone and
 * is treated as one person. Source-tuple is still used as a backstop for
 * old enrollments whose email/phone snapshots are null.
 *
 * COUNT DISTINCT workflow_id — being matched twice in the same workflow
 * (via email AND source-tuple, say) must not double-count.
 */
async function countActiveEnrollments({
  leadSourceType,
  leadSourceId,
  leadEmail = null,
  leadPhone = null,
  excludeWorkflowId = null,
  transaction = null,
}) {
  const { Op } = sequelize.Sequelize;
  const identityOr = buildIdentityOr({
    leadSourceType,
    leadSourceId,
    leadEmail,
    leadPhone,
  });

  const where = {
    [Op.or]: identityOr,
    status: ACTIVE_LIKE_STATUSES,
  };
  if (excludeWorkflowId) {
    where.workflow_id = { [Op.ne]: excludeWorkflowId };
  }
  return WorkflowEnrollment.count({
    where,
    distinct: true,
    col: "workflow_id",
    transaction,
  });
}

/**
 * Decide if `lead` can be enrolled in `workflowId`. Returns:
 *   { allowed: true, current, cap }
 *   { allowed: false, current, cap, reason: "active_workflow_cap_reached" }
 *
 * `excludeWorkflowId` should be the target workflow so the lead's existing
 * enrollment in it (if any) doesn't self-block.
 *
 * Identity (`leadEmail` / `leadPhone`) is the primary key for "is this the
 * same person." Source-tuple is used as a fallback only.
 */
async function canEnrollLead({
  leadSourceType,
  leadSourceId,
  leadEmail = null,
  leadPhone = null,
  workflowId,
  transaction = null,
}) {
  const cap = await resolveCap();
  const current = await countActiveEnrollments({
    leadSourceType,
    leadSourceId,
    leadEmail,
    leadPhone,
    excludeWorkflowId: workflowId,
    transaction,
  });
  if (current >= cap) {
    return {
      allowed: false,
      current,
      cap,
      reason: "active_workflow_cap_reached",
    };
  }
  return { allowed: true, current, cap };
}

module.exports = {
  canEnrollLead,
  countActiveEnrollments,
  resolveCap,
};
