const { Op, fn, col, literal } = require('sequelize');
const {
  Target,
  User,
  Lead,
  Payment,
  sequelize,
} = require('../models');
const { PAYMENT_STATUS } = require('../config/constants/payment');
const { getScopedUserIds } = require('../utils/dashboardScope');
const { hasGlobalScope } = require('../config/constants/roles');


/**
 * DROPPED ENROLLMENTS ARE DELIBERATELY INCLUDED in target actuals.
 *
 * A conversion or a rupee collected counted toward the target in the period it
 * happened. Removing it later because the student subsequently left would
 * retroactively fail a target that was genuinely met. Do not add a status
 * filter here.
 */
/**
 * Helpers: period boundaries in local time. Stored as ISO date strings
 * (DATEONLY), so JS Date is fine.
 */
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfQuarter(d = new Date()) {
  const m = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), m, 1);
}
function endOfQuarter(d = new Date()) {
  const m = Math.floor(d.getMonth() / 3) * 3 + 2;
  return new Date(d.getFullYear(), m + 1, 0, 23, 59, 59, 999);
}

function toDateOnly(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns the agent_id set a given target applies to:
 *   - org:     null (unrestricted)
 *   - manager: manager + all subordinates
 *   - agent:   [agent_id]
 */
async function resolveTargetScope(target) {
  if (target.scope_type === 'org') return null;
  if (target.scope_type === 'manager') {
    const subs = await User.findAll({
      where: { manager_id: target.scope_id },
      attributes: ['id'],
      raw: true,
    });
    return [target.scope_id, ...subs.map((s) => s.id)];
  }
  return [target.scope_id];
}

/**
 * Compute the actual achieved value for a target over its period.
 */
async function computeTargetActual(target) {
  const scopedAgentIds = await resolveTargetScope(target);

  const startDate = new Date(target.period_start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(target.period_end);
  endDate.setHours(23, 59, 59, 999);

  if (target.target_type === 'leads') {
    const where = {
      is_deleted: false,
      source_created_at: { [Op.between]: [startDate, endDate] },
    };
    if (scopedAgentIds !== null) {
      where.agent_id = { [Op.in]: scopedAgentIds };
    }
    return Lead.count({ where });
  }

  // Revenue and conversions use DIFFERENT definitions now:
  //   - Revenue:     SUM of all PAID payment amounts in the window (cash collected)
  //   - Conversions: COUNT of lead_courses whose FIRST PAID payment lands in
  //                  the window (i.e. new deals closed). Instalments against
  //                  an already-converted enrolment do NOT add a new conversion.
  //
  // For agent/manager-scoped targets we ONLY count leads explicitly assigned to
  // the scope — unassigned leads aren't anyone's quota.
  const replacements = { from: startDate, to: endDate };
  let scopeClause = '';
  // A re-enrollment advances no agent's target — it earns them no revenue and
  // no conversion (design decision #9), so counting it here would let a target
  // be hit on credit the agent was never given. An ORG-wide target
  // (scopedAgentIds === null) is not agent attribution, so it keeps the money:
  // both clauses stay empty in that case.
  let reenrollRevenueClause = '';
  let reenrollConvClause = '';
  if (scopedAgentIds !== null) {
    if (scopedAgentIds.length === 0) return 0;
    scopeClause = `AND l.agent_id IN (:agents)`;
    // Standalone payments (no enrollment) can't be re-enrollments, so they pass.
    reenrollRevenueClause = `AND COALESCE(lc.is_reenrollment, false) = false`;
    reenrollConvClause = `AND lc.is_reenrollment = false`;
    replacements.agents = scopedAgentIds;
  }

  if (target.target_type === 'revenue') {
    const rows = await sequelize.query(
      `
      WITH profile_pairs AS (
        SELECT DISTINCT l.profile_id
        FROM leads l
        WHERE l.is_deleted = false
          ${scopeClause}
      )
      SELECT COALESCE(SUM(p.amount), 0)::bigint AS total
      FROM payments p
      JOIN profile_pairs pp ON pp.profile_id = p.lead_profile_id
      LEFT JOIN lead_courses lc ON lc.id = p.lead_course_id
      WHERE p.status = 'paid'
        AND p.paid_at BETWEEN :from AND :to
        ${reenrollRevenueClause}
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    );
    return Number(rows[0]?.total) || 0;
  }

  // conversions
  const rows = await sequelize.query(
    `
    WITH profile_pairs AS (
      SELECT DISTINCT l.profile_id
      FROM leads l
      WHERE l.is_deleted = false
        ${scopeClause}
    ),
    first_paid AS (
      SELECT p.lead_course_id, MIN(p.paid_at) AS first_paid_at
      FROM payments p
      WHERE p.status = 'paid' AND p.lead_course_id IS NOT NULL
      GROUP BY p.lead_course_id
    )
    SELECT COUNT(*)::int AS count
    FROM first_paid fp
    JOIN lead_courses lc ON lc.id = fp.lead_course_id
    JOIN profile_pairs pp ON pp.profile_id = lc.lead_profile_id
    WHERE fp.first_paid_at BETWEEN :from AND :to
      ${reenrollConvClause}
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );
  return Number(rows[0]?.count) || 0;
}

/**
 * Decorate a Target with computed actual + pacing fields.
 */
async function decorateTarget(target) {
  const actual = await computeTargetActual(target);

  const start = new Date(target.period_start);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target.period_end);
  end.setHours(23, 59, 59, 999);
  const now = new Date();

  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - start.getTime()));
  const elapsedRatio = totalMs > 0 ? elapsedMs / totalMs : 1;

  const value = Number(target.value) || 0;
  const pace = value * elapsedRatio;
  const delta = actual - pace;
  const pctComplete = value > 0 ? (actual / value) * 100 : null;

  let status = 'on_track';
  if (now > end) {
    status = actual >= value ? 'hit' : 'missed';
  } else if (delta < -0.05 * value) {
    status = 'behind';
  } else if (delta > 0.05 * value) {
    status = 'ahead';
  }

  // Scope label for display
  let scope_name = 'Organisation';
  if (target.scope_type !== 'org' && target.scope_id) {
    const u = await User.findByPk(target.scope_id, { attributes: ['id', 'name'], raw: true });
    scope_name = u?.name || '—';
  }

  return {
    id: target.id,
    target_type: target.target_type,
    scope_type: target.scope_type,
    scope_id: target.scope_id,
    scope_name,
    period_type: target.period_type,
    period_start: toDateOnly(target.period_start),
    period_end: toDateOnly(target.period_end),
    value,
    actual,
    pace,
    delta,
    pct_complete: pctComplete === null ? null : Number(pctComplete.toFixed(1)),
    elapsed_pct: Number((elapsedRatio * 100).toFixed(1)),
    status,
    notes: target.notes,
    is_active: target.is_active,
    created_by: target.created_by,
  };
}

/**
 * List active targets relevant to the caller, with pacing computed.
 * Scope rules:
 *   - Superadmin: all active targets
 *   - Manager:    org + manager-self + agents-in-team
 *   - Agent:      org + agent-self
 */
async function listTargetsForUser(user) {
  const today = toDateOnly(new Date());
  const where = {
    is_active: true,
    period_start: { [Op.lte]: today },
    period_end: { [Op.gte]: today },
  };

  if (user.role === 'Manager') {
    const subs = await User.findAll({
      where: { manager_id: user.id },
      attributes: ['id'],
      raw: true,
    });
    const teamIds = [user.id, ...subs.map((s) => s.id)];
    where[Op.or] = [
      { scope_type: 'org' },
      { scope_type: 'manager', scope_id: user.id },
      { scope_type: 'agent', scope_id: { [Op.in]: teamIds } },
    ];
  } else if (user.role === 'Agent') {
    where[Op.or] = [
      { scope_type: 'org' },
      { scope_type: 'agent', scope_id: user.id },
    ];
  } else if (!hasGlobalScope(user.role)) {
    // Explicit floor: only org-wide roles get the unfiltered list, so a role
    // added later can't inherit full visibility by falling through.
    where[Op.or] = [{ scope_type: 'org' }];
  }

  const targets = await Target.findAll({ where, order: [['period_end', 'ASC']], raw: true });
  return Promise.all(targets.map(decorateTarget));
}

/**
 * Admin listing — returns all targets (active + expired), no actuals computed.
 * RBAC: org-wide roles see all. Manager sees own-team. Agent forbidden upstream.
 */
async function listAllTargets(user) {
  const where = {};
  if (!hasGlobalScope(user.role) && user.role !== 'Manager') return [];
  if (user.role === 'Manager') {
    const subs = await User.findAll({
      where: { manager_id: user.id },
      attributes: ['id'],
      raw: true,
    });
    const teamIds = [user.id, ...subs.map((s) => s.id)];
    where[Op.or] = [
      { scope_type: 'manager', scope_id: user.id },
      { scope_type: 'agent', scope_id: { [Op.in]: teamIds } },
    ];
  }
  return Target.findAll({ where, order: [['period_start', 'DESC']], raw: true });
}

function defaultPeriodBounds(period_type) {
  if (period_type === 'quarter') {
    return { start: startOfQuarter(), end: endOfQuarter() };
  }
  return { start: startOfMonth(), end: endOfMonth() };
}

/**
 * Create a target with RBAC + period normalisation.
 */
async function createTarget(user, body) {
  const allowedTypes = ['revenue', 'leads', 'conversions'];
  const allowedScopes = ['org', 'manager', 'agent'];
  const allowedPeriods = ['month', 'quarter', 'custom'];

  if (!allowedTypes.includes(body.target_type)) throw new Error('Invalid target_type');
  if (!allowedScopes.includes(body.scope_type)) throw new Error('Invalid scope_type');
  if (!allowedPeriods.includes(body.period_type)) throw new Error('Invalid period_type');
  if (!body.value || Number(body.value) <= 0) throw new Error('Value must be positive');

  // RBAC: Manager can only create manager-self or agent-in-team
  if (user.role === 'Manager') {
    if (body.scope_type === 'org') throw new Error('Managers cannot set org targets');
    if (body.scope_type === 'manager' && body.scope_id !== user.id) {
      throw new Error('Managers can only set targets for themselves');
    }
    if (body.scope_type === 'agent') {
      const target = await User.findByPk(body.scope_id, { attributes: ['manager_id'], raw: true });
      if (!target || (target.manager_id !== user.id && body.scope_id !== user.id)) {
        throw new Error('Agent not in your team');
      }
    }
  }

  if (body.scope_type !== 'org' && !body.scope_id) throw new Error('scope_id required');

  let { period_start, period_end } = body;
  if (body.period_type !== 'custom') {
    const { start, end } = defaultPeriodBounds(body.period_type);
    period_start = period_start || toDateOnly(start);
    period_end = period_end || toDateOnly(end);
  }
  if (!period_start || !period_end) throw new Error('period_start and period_end required');

  const scopeIdNormalized =
    body.scope_type === 'org' || !body.scope_id ? null : String(body.scope_id).toLowerCase();

  return Target.create({
    target_type: body.target_type,
    scope_type: body.scope_type,
    scope_id: scopeIdNormalized,
    period_type: body.period_type,
    period_start,
    period_end,
    value: Number(body.value),
    notes: body.notes || null,
    is_active: body.is_active !== false,
    created_by: user.id,
  });
}

async function updateTarget(user, id, body) {
  const target = await Target.findByPk(id);
  if (!target) throw new Error('Not found');

  // Manager RBAC: can only update targets within own team
  if (user.role === 'Manager') {
    if (target.scope_type === 'org') throw new Error('Forbidden');
    if (target.scope_type === 'manager' && target.scope_id !== user.id) {
      throw new Error('Forbidden');
    }
    if (target.scope_type === 'agent') {
      const u = await User.findByPk(target.scope_id, { attributes: ['manager_id'], raw: true });
      if (!u || (u.manager_id !== user.id && target.scope_id !== user.id)) {
        throw new Error('Forbidden');
      }
    }
  }

  const allowed = ['value', 'notes', 'is_active', 'period_start', 'period_end'];
  for (const k of allowed) {
    if (body[k] !== undefined) target[k] = body[k];
  }
  await target.save();
  return target;
}

async function deleteTarget(user, id) {
  const target = await Target.findByPk(id);
  if (!target) throw new Error('Not found');
  if (user.role === 'Manager') {
    if (target.scope_type === 'org') throw new Error('Forbidden');
    if (target.scope_type === 'manager' && target.scope_id !== user.id) {
      throw new Error('Forbidden');
    }
    if (target.scope_type === 'agent') {
      const u = await User.findByPk(target.scope_id, { attributes: ['manager_id'], raw: true });
      if (!u || (u.manager_id !== user.id && target.scope_id !== user.id)) {
        throw new Error('Forbidden');
      }
    }
  }
  await target.destroy();
}

module.exports = {
  listTargetsForUser,
  listAllTargets,
  createTarget,
  updateTarget,
  deleteTarget,
  computeTargetActual,
  decorateTarget,
};
