const psEnv = require("@ps/env/crm");
﻿const { Op, fn, col, literal } = require('sequelize');
const { Lead, Payment, Activity, LeadProfile, User, Status, Product, Subsource, sequelize } = require('../models');
const { PAYMENT_STATUS } = require('../config/constants/payment');
const { getScopedUserIds, applyAgentScope } = require('../utils/dashboardScope');


/**
 * DROPPED ENROLLMENTS ARE DELIBERATELY INCLUDED throughout this module.
 *
 * A drop ends an enrollment; it does not un-receive the money already paid into
 * it. Revenue, conversions, leaderboard credit and targets are all backward-
 * looking actuals, so filtering out lc.status='dropped' here would silently
 * rewrite closed months and move commission that has already been paid.
 *
 * Only forward-looking figures exclude dropped rows — open pipeline, forecast,
 * and active student counts. Those filters are explicit where they occur.
 */
// All "day" / "week" buckets are computed in this timezone so the chart's
// X-axis matches what a CRM user sees on their wall clock. Override later
// via env or org setting if multi-region support is needed.
const LOCAL_TZ = psEnv.DASHBOARD_TIMEZONE || 'Asia/Kolkata';

/**
 * SQL fragment that truncates a timestamptz column to the local day/week.
 * Usage: `date_trunc('day', col AT TIME ZONE '${LOCAL_TZ}')::date`
 */
function localDateTrunc(unit, column) {
  return `date_trunc('${unit}', ${column} AT TIME ZONE '${LOCAL_TZ}')::date`;
}

/**
 * Midnight at the start of "today" in LOCAL_TZ, returned as a JS Date
 * (UTC moment that corresponds to local midnight). Independent of the
 * server's process timezone — Node will be on UTC in prod and on host TZ in
 * dev, so we can't trust `setHours(0,0,0,0)`.
 */
function startOfLocalToday() {
  // en-CA produces YYYY-MM-DD format; toLocaleDateString respects timeZone.
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: LOCAL_TZ });
  // Get the offset of LOCAL_TZ at "now" so DST/non-standard zones still work.
  const offset = getTzOffset(LOCAL_TZ);
  return new Date(`${ymd}T00:00:00${offset}`);
}

function endOfLocalToday() {
  return new Date(startOfLocalToday().getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Returns a "+HH:MM" / "-HH:MM" offset string for the given IANA timezone at
 * the current instant. Works for fixed-offset zones (like IST) and DST zones.
 */
function getTzOffset(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(now);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  // "GMT+5:30" or "GMT-8"
  const m = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return '+00:00';
  const sign = m[1];
  const hh = String(m[2]).padStart(2, '0');
  const mm = m[3] || '00';
  return `${sign}${hh}:${mm}`;
}

/**
 * Build a base WHERE clause for leads scoped to a user's role and a date range.
 * `dateField` defaults to `source_created_at` (lead arrival time).
 */
function buildLeadWhere({ scopedUserIds, range, dateField = 'source_created_at', extra = {} }) {
  const where = { is_deleted: false, ...extra };
  if (range) {
    where[dateField] = { [Op.between]: [range.from, range.to] };
  }
  // KPI counting (countLeads, getFunnel) must be STRICT — an unassigned lead
  // isn't anyone's lead. Including it in agent/manager KPIs causes the agent's
  // own dashboard to show higher numbers than the leaderboard/scorecard. For
  // Superadmin (scopedUserIds === null) the function skips the filter entirely
  // and sees everything anyway.
  applyAgentScope(where, scopedUserIds, { include_unassigned: false });
  return where;
}

/**
 * Count leads matching scope + range.
 *
 * `dateField` picks which timestamp the window applies to:
 *   - source_created_at (default) — first arrival. Powers "New in period".
 *   - lead_update_date            — last entry/re-entry. Powers "Total leads"
 *                                   and the Lead Status donut.
 */
async function countLeads({ scopedUserIds, range, dateField = 'source_created_at' }) {
  return Lead.count({ where: buildLeadWhere({ scopedUserIds, range, dateField }) });
}

/**
 * Returns { total, count } where:
 *   total = SUM of PAID payment amounts in window (cash collected) — for the
 *           Revenue KPI.
 *   count = number of lead_courses whose FIRST PAID payment fell in the
 *           window — for the Conversions KPI. Instalments against an
 *           already-converted enrolment are NOT counted again.
 *
 * Scope is STRICT — only leads explicitly assigned to scoped agents count.
 * Unassigned leads belong to the org pool, not to any individual quota; they
 * surface only at the Superadmin org-wide level (where scopedUserIds = null
 * skips the agent filter entirely). This keeps the agent's own KPI in sync
 * with the leaderboard/scorecard view of the same agent.
 */
async function sumRevenue({ scopedUserIds, range }) {
  const replacements = { from: range.from, to: range.to };
  let scopeClause = '';
  // Conversions are always credited to the enrollment's frozen owner.
  let convOwnerClause = '';
  // Revenue is hybrid: enrollment-linked payments credit the frozen owner;
  // standalone payments (no lead_course) keep live profile-based attribution
  // so the Revenue total stays whole.
  let revenueScope = 'TRUE';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return { total: 0, count: 0 };
    scopeClause = `AND l.agent_id IN (:agents)`;
    // A re-enrollment earns the owning agent NOTHING — not revenue, not
    // conversions (design decision #9). The exclusion lives only in the SCOPED
    // branch: org-wide (scopedUserIds = null) the money is still real company
    // revenue and stays in the total, where the leaderboard's "Unassigned /
    // Other" row accounts for it. Applying it to both would delete the money
    // from the company books, not just from an agent's credit.
    convOwnerClause = `AND lc.owner_agent_id IN (:agents) AND lc.is_reenrollment = false`;
    // A deferral fee is excluded for the same reason as a re-enrollment: it is
    // real company money but it is not a sale, so it does not belong on an
    // agent's row. Org-wide (the else branch) it stays in the total, where the
    // leaderboard's "Unassigned / Other" row accounts for it.
    revenueScope = `
      (p.lead_course_id IS NOT NULL AND lc.owner_agent_id IN (:agents) AND lc.is_reenrollment = false AND p.purpose <> 'deferral_fee')
      OR
      (p.lead_course_id IS NULL AND p.lead_profile_id IN (SELECT profile_id FROM profile_pairs))
    `;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    WITH profile_pairs AS (
      SELECT DISTINCT l.profile_id
      FROM leads l
      WHERE l.is_deleted = false
        ${scopeClause}
    ),
    revenue_total AS (
      -- NOTE: deliberately NOT filtered by lc.status. A dropped enrollment
      -- keeps every payment it already received: the money genuinely arrived,
      -- and excluding it here would retroactively rewrite a closed month.
      -- Only forward-looking figures (open pipeline, forecast, active counts)
      -- exclude dropped rows. Do not "fix" this.
      SELECT COALESCE(SUM(COALESCE(p.base_amount, p.amount)), 0)::bigint AS total
      FROM payments p
      LEFT JOIN lead_courses lc ON lc.id = p.lead_course_id
      WHERE p.status = 'paid'
        AND p.paid_at BETWEEN :from AND :to
        AND (${revenueScope})
    ),
    first_paid AS (
      -- Deferral fees are excluded: a conversion is the moment a student first
      -- pays for the COURSE. A student who enrols, pays nothing, then pays a
      -- rescheduling fee has not converted, and crediting the agent a sale for
      -- it would be wrong in both directions — the count and the date.
      SELECT p.lead_course_id, MIN(p.paid_at) AS first_paid_at
      FROM payments p
      WHERE p.status = 'paid' AND p.lead_course_id IS NOT NULL
        AND p.purpose <> 'deferral_fee'
      GROUP BY p.lead_course_id
    ),
    conv_count AS (
      -- Also deliberately unfiltered by status: the conversion happened in the
      -- period it happened. Decrementing a past month would move commission
      -- that has already been paid out.
      SELECT COUNT(*)::int AS count
      FROM first_paid fp
      JOIN lead_courses lc ON lc.id = fp.lead_course_id
      WHERE fp.first_paid_at BETWEEN :from AND :to
        ${convOwnerClause}
    )
    SELECT
      (SELECT total FROM revenue_total) AS total,
      (SELECT count FROM conv_count)    AS count
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  const r = rows[0] || {};
  return {
    total: Number(r.total) || 0,
    count: Number(r.count) || 0,
  };
}

/**
 * Average time (in minutes) between lead.source_created_at and the first
 * activity (Note/Call/StatusChange/FollowUp) for that lead, scoped + windowed.
 */
async function avgTimeToFirstContact({ scopedUserIds, range }) {
  const replacements = { from: range.from, to: range.to };
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return null;
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    SELECT AVG(EXTRACT(EPOCH FROM (first_act.first_at - l.source_created_at))/60.0)::float AS avg_minutes
    FROM leads l
    JOIN LATERAL (
      SELECT MIN(a.created_at) AS first_at
      FROM activities a
      WHERE a.lead_id = l.id
        AND a.type IN ('Note', 'Call', 'StatusChange', 'FollowUp')
    ) first_act ON TRUE
    WHERE l.is_deleted = false
      AND l.source_created_at BETWEEN :from AND :to
      AND first_act.first_at IS NOT NULL
      ${scopeClause}
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return rows[0] && rows[0].avg_minutes !== null ? Number(rows[0].avg_minutes) : null;
}

/**
 * Count of distinct agents who logged any activity in the window.
 * Used for Manager/Superadmin "active agents" KPI.
 */
async function countActiveAgents({ scopedUserIds, range }) {
  const where = {
    created_at: { [Op.between]: [range.from, range.to] },
    actor_id: { [Op.not]: null },
  };
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return 0;
    where.actor_id = { [Op.in]: scopedUserIds };
  }
  const rows = await Activity.findAll({
    where,
    attributes: [[fn('COUNT', fn('DISTINCT', col('actor_id'))), 'count']],
    raw: true,
  });
  return Number(rows[0].count) || 0;
}

/**
 * Count of currently-open leads assigned to the caller (Agent-specific KPI).
 * "Open" = not deleted, has agent_id = self, regardless of period.
 */
async function countMyOpenLeads({ user_id }) {
  return Lead.count({
    where: {
      is_deleted: false,
      agent_id: user_id,
    },
  });
}

/**
 * Priority-sorted queue for an agent (or scoped set of agents):
 *   1. Overdue follow-ups (next_followup < now)
 *   2. Today's follow-ups
 *   3. High-intent open leads with no follow-up yet
 */
async function getQueue({ scopedUserIds, limit = 25 }) {
  const startOfToday = startOfLocalToday();
  const endOfToday = endOfLocalToday();

  const baseWhere = { is_deleted: false };
  applyAgentScope(baseWhere, scopedUserIds, { include_unassigned: false });

  const include = [
    { model: LeadProfile, as: 'Profile', attributes: ['id', 'name', 'phone', 'email', 'intent'] },
    { model: Status, as: 'StatusConfig', attributes: ['id', 'label', 'color'] },
    { model: User, as: 'Agent', attributes: ['id', 'name'] },
  ];

  const [overdue, today, highIntentNew] = await Promise.all([
    Lead.findAll({
      where: { ...baseWhere, next_followup: { [Op.lt]: startOfToday } },
      include,
      order: [['next_followup', 'DESC']],
      limit,
    }),
    Lead.findAll({
      where: { ...baseWhere, next_followup: { [Op.between]: [startOfToday, endOfToday] } },
      include,
      order: [['next_followup', 'ASC']],
      limit,
    }),
    Lead.findAll({
      where: { ...baseWhere, next_followup: null },
      include: [
        {
          model: LeadProfile,
          as: 'Profile',
          attributes: ['id', 'name', 'phone', 'email', 'intent'],
          where: { intent: 'High' },
          required: true,
        },
        { model: Status, as: 'StatusConfig', attributes: ['id', 'label', 'color'] },
        { model: User, as: 'Agent', attributes: ['id', 'name'] },
      ],
      order: [['source_created_at', 'DESC']],
      limit,
    }),
  ]);

  const shape = (lead, bucket) => ({
    id: lead.id,
    profile_id: lead.profile_id,
    profile: lead.Profile,
    status: lead.StatusConfig,
    agent: lead.Agent,
    next_followup: lead.next_followup,
    source_created_at: lead.source_created_at,
    product_id: lead.product_id,
    bucket,
  });

  return [
    ...overdue.map((l) => shape(l, 'overdue')),
    ...today.map((l) => shape(l, 'today')),
    ...highIntentNew.map((l) => shape(l, 'new_high_intent')),
  ].slice(0, limit);
}

/**
 * Current-status distribution of the leads that came in during the window,
 * ordered by Status.sort_order. Powers the Lead Status donut.
 *
 * Windowed on lead_update_date — the lead's last entry/re-entry — so it shares
 * a basis with the "Total leads" KPI and SUM(counts) === that KPI exactly
 * (every lead has exactly one current status).
 *
 * The status shown is the lead's CURRENT one: this is a snapshot of where those
 * leads sit now, not what status they held mid-period.
 */
async function getFunnel({ scopedUserIds, range }) {
  const where = buildLeadWhere({ scopedUserIds, range, dateField: 'lead_update_date' });

  const rows = await Lead.findAll({
    where,
    attributes: ['status_id', [fn('COUNT', col('Lead.id')), 'count']],
    group: ['status_id'],
    raw: true,
  });

  const counts = Object.fromEntries(rows.map((r) => [r.status_id, Number(r.count)]));

  const statuses = await Status.findAll({
    order: [['sort_order', 'ASC']],
    raw: true,
  });

  // Show every active status (so empty stages still render as 0), plus any
  // DEACTIVATED status that still holds leads. Without that second clause a
  // status turned off while leads sat in it would drop them from the donut
  // silently, and SUM(counts) would quietly stop matching the Total leads KPI.
  return statuses
    .filter((s) => !s.is_deactivated || (counts[s.id] || 0) > 0)
    .map((s) => ({
      status_id: s.id,
      label: s.label,
      color: s.color,
      sort_order: s.sort_order,
      count: counts[s.id] || 0,
    }));
}

/**
 * Recent activities for leads the caller can see.
 */
async function getActivityFeed({ scopedUserIds, limit = 20 }) {
  const where = {};
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    where[Op.or] = [
      { actor_id: { [Op.in]: scopedUserIds } },
      { '$Lead.agent_id$': { [Op.in]: scopedUserIds } },
    ];
  }

  const activities = await Activity.findAll({
    where,
    include: [
      {
        model: Lead,
        as: 'Lead',
        attributes: ['id', 'agent_id', 'product_id'],
        include: [
          { model: LeadProfile, as: 'Profile', attributes: ['id', 'name', 'phone'] },
        ],
      },
      { model: User, as: 'Actor', attributes: ['id', 'name'] },
    ],
    order: [['created_at', 'DESC']],
    limit,
  });

  return activities.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    details: a.details,
    metadata: a.metadata,
    created_at: a.createdAt || a.get('created_at'),
    actor: a.Actor ? { id: a.Actor.id, name: a.Actor.name } : null,
    lead: a.Lead
      ? {
          id: a.Lead.id,
          profile: a.Lead.Profile
            ? { id: a.Lead.Profile.id, name: a.Lead.Profile.name, phone: a.Lead.Profile.phone }
            : null,
        }
      : null,
  }));
}

/**
 * Lead counts bucketed by day for a personal trend chart.
 */
async function getWeeklyTrend({ scopedUserIds, days = 14 }) {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);

  const replacements = { from, to: now };
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    scopeClause = `AND agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    SELECT ${localDateTrunc('day', 'source_created_at')} AS bucket,
           COUNT(*)::int AS count
    FROM leads
    WHERE is_deleted = false
      AND source_created_at BETWEEN :from AND :to
      ${scopeClause}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return rows.map((r) => ({ date: bucketToIsoDate(r.bucket), count: Number(r.count) }));
}

/**
 * Per-agent leaderboard. Rows ordered by revenue desc.
 * scopedUserIds = the team to rank (manager's subordinates, or all for Superadmin).
 */
async function getLeaderboard({ scopedUserIds, range }) {
  const replacements = { from: range.from, to: range.to };
  let scopeFilter = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    scopeFilter = `AND u.id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    WITH agents AS (
      SELECT u.id, u.name, u.role
      FROM users u
      WHERE u.is_active = true AND u.role IN ('Agent', 'Manager')
        ${scopeFilter}
    ),
    lead_counts AS (
      SELECT l.agent_id,
             COUNT(*)::int AS leads,
             AVG(EXTRACT(EPOCH FROM (
               (SELECT MIN(a.created_at) FROM activities a
                WHERE a.lead_id = l.id
                  AND a.type IN ('Note','Call','StatusChange','FollowUp'))
               - l.source_created_at))/60.0)::float AS avg_first_contact_min
      FROM leads l
      WHERE l.is_deleted = false
        AND l.source_created_at BETWEEN :from AND :to
      GROUP BY l.agent_id
    ),
    -- Distinct (agent, profile) pairs — still used to attribute STANDALONE
    -- payments (those with no lead_course) by live lead ownership.
    agent_profile_pairs AS (
      SELECT DISTINCT agent_id, profile_id
      FROM leads
      WHERE is_deleted = false AND agent_id IS NOT NULL
    ),
    -- Revenue = SUM of paid amounts in window (cash collected, instalments
    -- included). Hybrid attribution: enrollment-linked payments credit the
    -- enrollment's frozen owner; standalone payments fall back to live lead
    -- ownership so the org total is unchanged.
    --
    -- Re-enrollments are excluded from every agent's row (decision #9). This
    -- query only ever produces per-agent rows, so the filter is unconditional
    -- here. The money is NOT lost: getLeaderboard's caller derives the
    -- "Unassigned / Other" row as (org total − sum of agent rows), and the
    -- org total still contains it — so the board still reconciles.
    revenue_totals AS (
      SELECT agent_id, COALESCE(SUM(revenue), 0)::bigint AS revenue
      FROM (
        SELECT lc.owner_agent_id AS agent_id,
               COALESCE(p.base_amount, p.amount) AS revenue
        FROM payments p
        JOIN lead_courses lc ON lc.id = p.lead_course_id
        WHERE p.status = 'paid'
          AND p.paid_at BETWEEN :from AND :to
          AND lc.owner_agent_id IS NOT NULL
          AND lc.is_reenrollment = false
          -- A rescheduling fee is not a sale. Same treatment, same line.
          AND p.purpose <> 'deferral_fee'
        UNION ALL
        SELECT ap.agent_id,
               COALESCE(p.base_amount, p.amount) AS revenue
        FROM payments p
        JOIN agent_profile_pairs ap ON ap.profile_id = p.lead_profile_id
        WHERE p.status = 'paid'
          AND p.paid_at BETWEEN :from AND :to
          AND p.lead_course_id IS NULL
      ) r
      GROUP BY agent_id
    ),
    -- Conversions = count of lead_courses whose FIRST paid payment is in
    -- the window, credited to the enrollment's frozen owner. Subsequent
    -- instalments do not add new conversions.
    first_paid AS (
      -- Deferral fees excluded — see the same CTE in sumRevenue.
      SELECT p.lead_course_id, MIN(p.paid_at) AS first_paid_at
      FROM payments p
      WHERE p.status = 'paid' AND p.lead_course_id IS NOT NULL
        AND p.purpose <> 'deferral_fee'
      GROUP BY p.lead_course_id
    ),
    conversion_counts AS (
      SELECT lc.owner_agent_id AS agent_id,
             COUNT(*)::int AS conversions
      FROM first_paid fp
      JOIN lead_courses lc ON lc.id = fp.lead_course_id
      WHERE fp.first_paid_at BETWEEN :from AND :to
        AND lc.owner_agent_id IS NOT NULL
        AND lc.is_reenrollment = false
      GROUP BY lc.owner_agent_id
    ),
    payment_totals AS (
      SELECT COALESCE(rt.agent_id, cc.agent_id) AS agent_id,
             COALESCE(cc.conversions, 0)::int   AS conversions,
             COALESCE(rt.revenue, 0)::bigint    AS revenue
      FROM revenue_totals rt
      FULL OUTER JOIN conversion_counts cc ON cc.agent_id = rt.agent_id
    )
    SELECT a.id AS agent_id,
           a.name AS agent_name,
           a.role,
           COALESCE(lc.leads, 0) AS leads,
           COALESCE(pt.conversions, 0) AS conversions,
           COALESCE(pt.revenue, 0) AS revenue,
           lc.avg_first_contact_min,
           CASE WHEN COALESCE(lc.leads, 0) = 0 THEN 0
                ELSE ROUND((COALESCE(pt.conversions, 0)::numeric / lc.leads) * 100, 1) END AS conv_pct
    FROM agents a
    LEFT JOIN lead_counts lc ON lc.agent_id = a.id
    LEFT JOIN payment_totals pt ON pt.agent_id = a.id
    ORDER BY revenue DESC, conversions DESC, leads DESC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return rows.map((r) => ({
    agent_id: r.agent_id,
    agent_name: r.agent_name,
    role: r.role,
    leads: Number(r.leads),
    conversions: Number(r.conversions),
    revenue: Number(r.revenue),
    conv_pct: Number(r.conv_pct),
    avg_first_contact_min: r.avg_first_contact_min === null ? null : Number(r.avg_first_contact_min),
  }));
}

/**
 * Agent Ã— Status matrix of open leads (no date window â€” current state).
 */
async function getWorkload({ scopedUserIds }) {
  const replacements = {};
  let scopeFilter = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return { agents: [], statuses: [], matrix: [] };
    scopeFilter = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    SELECT l.agent_id,
           u.name AS agent_name,
           l.status_id,
           s.label AS status_label,
           s.color AS status_color,
           s.sort_order AS status_order,
           COUNT(*)::int AS count
    FROM leads l
    JOIN statuses s ON s.id = l.status_id
    LEFT JOIN users u ON u.id = l.agent_id
    WHERE l.is_deleted = false
      AND l.agent_id IS NOT NULL
      ${scopeFilter}
    GROUP BY l.agent_id, u.name, l.status_id, s.label, s.color, s.sort_order
    ORDER BY u.name ASC, s.sort_order ASC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  const agentMap = new Map();
  const statusMap = new Map();
  for (const r of rows) {
    if (!agentMap.has(r.agent_id)) {
      agentMap.set(r.agent_id, { id: r.agent_id, name: r.agent_name });
    }
    if (!statusMap.has(r.status_id)) {
      statusMap.set(r.status_id, {
        id: r.status_id,
        label: r.status_label,
        color: r.status_color,
        sort_order: Number(r.status_order),
      });
    }
  }

  return {
    agents: Array.from(agentMap.values()),
    statuses: Array.from(statusMap.values()).sort((a, b) => a.sort_order - b.sort_order),
    matrix: rows.map((r) => ({
      agent_id: r.agent_id,
      status_id: r.status_id,
      count: Number(r.count),
    })),
  };
}

/**
 * Date Ã— Agent heatmap of upcoming follow-ups.
 * Returns `days` entries forward from today (inclusive).
 */
async function getFollowupHeatmap({ scopedUserIds, days = 14 }) {
  const startOfToday = startOfLocalToday();
  const end = new Date(startOfToday.getTime() + days * 24 * 60 * 60 * 1000);

  const replacements = { from: startOfToday, to: end };
  let scopeFilter = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return { agents: [], days: [], matrix: [] };
    scopeFilter = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    SELECT l.agent_id,
           u.name AS agent_name,
           date_trunc('day', l.next_followup AT TIME ZONE 'Asia/Kolkata')::date AS day,
           COUNT(*)::int AS count
    FROM leads l
    JOIN users u ON u.id = l.agent_id
    WHERE l.is_deleted = false
      AND l.next_followup BETWEEN :from AND :to
      ${scopeFilter}
    GROUP BY l.agent_id, u.name, day
    ORDER BY u.name ASC, day ASC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  const agentMap = new Map();
  for (const r of rows) {
    if (!agentMap.has(r.agent_id)) {
      agentMap.set(r.agent_id, { id: r.agent_id, name: r.agent_name });
    }
  }

  // Build day list from today forward, formatted in LOCAL_TZ to match the
  // backend's date_trunc(..., AT TIME ZONE LOCAL_TZ) buckets.
  const dayList = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startOfToday.getTime() + i * 24 * 60 * 60 * 1000);
    dayList.push(d.toLocaleDateString('en-CA', { timeZone: LOCAL_TZ }));
  }

  return {
    agents: Array.from(agentMap.values()),
    days: dayList,
    matrix: rows.map((r) => ({
      agent_id: r.agent_id,
      day: typeof r.day === 'string' ? r.day : bucketToIsoDate(r.day),
      count: Number(r.count),
    })),
  };
}

/**
 * Unassigned leads visible to the caller (Manager: in team scope only via
 * include_unassigned=true; Superadmin: all). Returns recent N.
 */
async function getUnassignedLeads({ scopedUserIds, limit = 20 }) {
  const where = { is_deleted: false, agent_id: null };
  // Note: Managers see all unassigned (no filter needed); Superadmin too.
  // Agents shouldn't be calling this endpoint.

  const leads = await Lead.findAll({
    where,
    include: [
      { model: LeadProfile, as: 'Profile', attributes: ['id', 'name', 'phone', 'intent'] },
      { model: Status, as: 'StatusConfig', attributes: ['id', 'label', 'color'] },
    ],
    order: [['source_created_at', 'DESC']],
    limit,
  });

  return leads.map((l) => ({
    id: l.id,
    profile_id: l.profile_id,
    profile: l.Profile,
    status: l.StatusConfig,
    product_id: l.product_id,
    source_created_at: l.source_created_at,
  }));
}

/**
 * Time-series for a single metric, bucketed by day or week.
 * metric: 'leads' | 'revenue' | 'conversions'
 * split_by: optional 'product' | 'source' â€” returns one series per split value.
 */
async function getTimeseries({ scopedUserIds, range, metric, group_by = 'day', split_by = null }) {
  const replacements = { from: range.from, to: range.to };
  const bucketFn = group_by === 'week' ? 'week' : 'day';
  let scopeFilter = '';
  let sourceTable;
  let dateCol;
  let valueExpr;
  let splitCol;

  if (metric === 'revenue' || metric === 'conversions') {
    // Revenue path: SUM of paid amounts per bucket on paid_at (cash collected).
    // Conversions path: COUNT of lead_courses whose FIRST paid payment falls
    // in the bucket — instalments don't add new conversions.

    // Frozen-owner scoping, matching the leaderboard/KPI attribution:
    //  - conversions are purely enrollment-based → scope by lead_course owner.
    //  - revenue is hybrid → enrollment-linked by owner, standalone by live
    //    lead ownership (keeps the charted total whole).
    let revScope = '';
    let convScope = '';
    // Re-enrollments are excluded from agent attribution (decision #9) — and,
    // as in sumRevenue, only from the SCOPED branch. Charted org-wide, the
    // money is still company revenue and the line must match the KPI above it.
    if (scopedUserIds !== null) {
      if (scopedUserIds.length === 0) return { series: [] };
      convScope = `AND p.lead_course_id IN (
        SELECT id FROM lead_courses
        WHERE owner_agent_id IN (:agents) AND is_reenrollment = false
      )`;
      revScope = `AND (
        (p.lead_course_id IS NOT NULL AND p.purpose <> 'deferral_fee' AND p.lead_course_id IN (
          SELECT id FROM lead_courses
          WHERE owner_agent_id IN (:agents) AND is_reenrollment = false
        ))
        OR
        (p.lead_course_id IS NULL AND p.lead_profile_id IN (
          SELECT DISTINCT profile_id FROM leads
          WHERE is_deleted = false AND agent_id IN (:agents)
        ))
      )`;
      replacements.agents = scopedUserIds;
    }

    if (metric === 'revenue') {
      dateCol = 'p.paid_at';
      valueExpr = 'COALESCE(SUM(COALESCE(p.base_amount, p.amount)), 0)';
      if (split_by === 'product') {
        sourceTable = `
          payments p
          LEFT JOIN lead_courses lc ON lc.id = p.lead_course_id
          LEFT JOIN products pr ON pr.id = lc.course_id
        `;
        splitCol = `COALESCE(pr.label, lc.program_name, '(unknown)')`;
      } else {
        sourceTable = `payments p`;
        splitCol = null;
      }
      const where = `p.status = 'paid' AND p.paid_at BETWEEN :from AND :to ${revScope}`;
      return runBucketedQuery({ sourceTable, dateCol, valueExpr, where, bucketFn, splitCol, replacements });
    }

    // conversions — bucket each lead_course by the date of its first paid payment.
    // Implementation: build the "first_paid per lead_course" set in a derived
    // subquery, then bucket on first_paid_at.
    dateCol = 'p.paid_at';
    valueExpr = 'COUNT(*)';
    if (split_by === 'product') {
      sourceTable = `
        (
          SELECT p2.lead_course_id, MIN(p2.paid_at) AS paid_at
          FROM payments p2
          WHERE p2.status = 'paid' AND p2.lead_course_id IS NOT NULL
            AND p2.purpose <> 'deferral_fee'
          GROUP BY p2.lead_course_id
        ) p
        JOIN lead_courses lc ON lc.id = p.lead_course_id
        LEFT JOIN products pr ON pr.id = lc.course_id
      `;
      splitCol = `COALESCE(pr.label, lc.program_name, '(unknown)')`;
    } else {
      sourceTable = `
        (
          SELECT p2.lead_course_id, p2.lead_profile_id, MIN(p2.paid_at) AS paid_at
          FROM payments p2
          WHERE p2.status = 'paid' AND p2.lead_course_id IS NOT NULL
            AND p2.purpose <> 'deferral_fee'
          GROUP BY p2.lead_course_id, p2.lead_profile_id
        ) p
      `;
      splitCol = null;
    }
    const where = `p.paid_at BETWEEN :from AND :to ${convScope}`;
    return runBucketedQuery({ sourceTable, dateCol, valueExpr, where, bucketFn, splitCol, replacements });
  }

  // metric = 'leads'
  sourceTable = `leads l LEFT JOIN products pr ON pr.id = l.product_id LEFT JOIN subsources sub ON sub.id = l.subsource_id`;
  dateCol = 'l.source_created_at';
  valueExpr = 'COUNT(*)';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return { series: [] };
    scopeFilter = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }
  splitCol =
    split_by === 'product'
      ? 'COALESCE(pr.label, l.product_id)'
      : split_by === 'source'
        ? 'COALESCE(sub.label, l.subsource_id, \'(none)\')'
        : null;
  const where = `l.is_deleted = false AND l.source_created_at BETWEEN :from AND :to ${scopeFilter}`;
  return runBucketedQuery({ sourceTable, dateCol, valueExpr, where, bucketFn, splitCol, replacements });
}

async function runBucketedQuery({ sourceTable, dateCol, valueExpr, where, bucketFn, splitCol, replacements }) {
  const bucketExpr = localDateTrunc(bucketFn, dateCol);

  if (splitCol) {
    const sql = `
      SELECT ${bucketExpr} AS bucket,
             ${splitCol} AS split_key,
             ${valueExpr}::bigint AS value
      FROM ${sourceTable}
      WHERE ${where}
      GROUP BY bucket, split_key
      ORDER BY bucket ASC, split_key ASC
    `;
    const rows = await sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
    const buckets = new Map();
    const keys = new Set();
    for (const r of rows) {
      const b = bucketToIsoDate(r.bucket);
      const k = r.split_key || '(none)';
      keys.add(k);
      if (!buckets.has(b)) buckets.set(b, { date: b });
      buckets.get(b)[k] = Number(r.value);
    }
    return {
      series: Array.from(buckets.values()),
      keys: Array.from(keys),
    };
  }

  const sql = `
    SELECT ${bucketExpr} AS bucket,
           ${valueExpr}::bigint AS value
    FROM ${sourceTable}
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;
  const rows = await sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
  return {
    series: rows.map((r) => ({
      date: bucketToIsoDate(r.bucket),
      value: Number(r.value),
    })),
    keys: ['value'],
  };
}

/**
 * Convert a postgres date/timestamp result into a "YYYY-MM-DD" string.
 * Sequelize sometimes returns a Date (UTC midnight), sometimes a string.
 * Using UTC accessors avoids the local-tz off-by-one that would shift the
 * date for IST/west-of-UTC environments.
 */
function bucketToIsoDate(value) {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Per-course performance from the `lead_courses` table with `final_fee` as
 * the contracted value. Has two modes:
 *
 *   - Period (range provided): only enrolments whose lead_courses.created_at
 *     falls in [range.from, range.to]. Cohort view — "are signups from this
 *     window converting?".
 *   - Snapshot (range omitted): every enrolment in the system. Lifetime view.
 *
 * In both modes, the "paid" flag is lifetime (has ever had a PAID payment)
 * since payment can land after the enrolment window.
 *
 * Columns per course:
 *   - enrolled              enrolments (filtered to window or all-time)
 *   - paid                  of those, ones that have a PAID payment
 *   - unpaid                enrolled − paid (still-open enrolments)
 *   - pipeline_value        SUM(final_fee) of all
 *   - won_value             SUM(final_fee) of paid
 *   - open_pipeline_value   SUM(final_fee) of unpaid
 *   - conv_pct              paid ÷ enrolled
 *
 * Scope: agent/manager-scoped to lead_courses whose profile has at least one
 * lead owned by the scoped agents. Superadmin: no filter.
 */
async function getProductMatrix({ scopedUserIds, range }) {
  const replacements = {};
  let scopeJoin = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    // Scope by the enrollment's frozen owner so these per-course counts match
    // the Enrollments list (which is also owner-scoped) rather than current
    // lead ownership.
    scopeJoin = `AND lc.owner_agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  let dateFilter = '';
  if (range && range.from && range.to) {
    dateFilter = `AND lc.created_at BETWEEN :from AND :to`;
    replacements.from = range.from;
    replacements.to = range.to;
  }

  const rows = await sequelize.query(
    `
    WITH enrolment_paid_flags AS (
      SELECT lc.id,
             lc.course_id,
             lc.program_name,
             lc.final_fee,
             lc.status,
             EXISTS (
               SELECT 1 FROM payments p
               WHERE p.lead_course_id = lc.id AND p.status = 'paid'
             ) AS is_paid
      FROM lead_courses lc
      WHERE lc.course_id IS NOT NULL
        ${dateFilter}
        ${scopeJoin}
    )
    -- "How many people are on each course right now" — a forward-looking count,
    -- so every figure below is over ACTIVE rows only. Dropped ones are counted
    -- once, separately, as \`dropped\`: hiding them entirely would make a course
    -- that lost half its cohort look identical to one that never filled.
    SELECT course_id,
           MAX(program_name)                                                   AS program_name,
           COUNT(*) FILTER (WHERE status = 'active')::int                      AS enrolled,
           COUNT(*) FILTER (WHERE status = 'dropped')::int                     AS dropped,
           COUNT(*) FILTER (WHERE status = 'active' AND is_paid)::int          AS paid,
           COUNT(*) FILTER (WHERE status = 'active' AND NOT is_paid)::int      AS unpaid,
           COALESCE(SUM(final_fee) FILTER (WHERE status = 'active'), 0)::bigint AS pipeline_value,
           COALESCE(SUM(final_fee) FILTER (WHERE status = 'active' AND is_paid), 0)::bigint     AS won_value,
           COALESCE(SUM(final_fee) FILTER (WHERE status = 'active' AND NOT is_paid), 0)::bigint AS open_pipeline_value,
           CASE WHEN COUNT(*) FILTER (WHERE status = 'active') = 0 THEN NULL
                ELSE ROUND(
                  (COUNT(*) FILTER (WHERE status = 'active' AND is_paid)::numeric
                   / COUNT(*) FILTER (WHERE status = 'active')) * 100, 1
                ) END                                                          AS conv_pct
    FROM enrolment_paid_flags
    GROUP BY course_id
    ORDER BY won_value DESC NULLS LAST, pipeline_value DESC NULLS LAST
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return rows.map((r) => ({
    course_id: r.course_id,
    label: r.program_name || r.course_id,
    enrolled: Number(r.enrolled) || 0,
    dropped: Number(r.dropped) || 0,
    paid: Number(r.paid) || 0,
    unpaid: Number(r.unpaid) || 0,
    pipeline_value: Number(r.pipeline_value) || 0,
    won_value: Number(r.won_value) || 0,
    open_pipeline_value: Number(r.open_pipeline_value) || 0,
    conv_pct: r.conv_pct === null ? null : Number(r.conv_pct),
  }));
}

/**
 * Performance grouped by subsource (sub-channel), with parent product label.
 */
async function getSourcePerformance({ scopedUserIds, range }) {
  const replacements = { from: range.from, to: range.to };
  let scopeFilter = '';
  // Frozen-owner scope for the enrollment-linked metrics (revenue/conversions),
  // matching the leaderboard. The leads JOIN still resolves the subsource.
  let ownerScope = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    scopeFilter = `AND l.agent_id IN (:agents)`;
    // Re-enrollments carry no agent credit (decision #9), so a scoped view of
    // this report drops them. Org-wide it keeps them: at that level this is a
    // CHANNEL report, and the money really did arrive through that channel —
    // removing it would stop source revenue reconciling with company revenue.
    ownerScope = `AND lc.owner_agent_id IN (:agents) AND lc.is_reenrollment = false`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    WITH lead_stats AS (
      SELECT l.subsource_id, l.product_id,
             COUNT(*)::int AS leads
      FROM leads l
      WHERE l.is_deleted = false
        AND l.source_created_at BETWEEN :from AND :to
        ${scopeFilter}
      GROUP BY l.subsource_id, l.product_id
    ),
    -- Revenue = SUM of paid amounts; Conversions = lead_courses whose first
    -- paid payment lands in window. The leads JOIN attributes to a subsource.
    -- Revenue is hybrid: enrollment-linked credited via the frozen owner,
    -- standalone payments via live lead ownership.
    first_paid AS (
      -- Deferral fees excluded: a conversion is the moment a student first
      -- pays for the COURSE, not for a rescheduling charge.
      SELECT p.lead_course_id, MIN(p.paid_at) AS first_paid_at
      FROM payments p
      WHERE p.status = 'paid' AND p.lead_course_id IS NOT NULL
        AND p.purpose <> 'deferral_fee'
      GROUP BY p.lead_course_id
    ),
    revenue_stats AS (
      SELECT subsource_id, COALESCE(SUM(rev), 0)::bigint AS revenue
      FROM (
        SELECT l.subsource_id, COALESCE(p.base_amount, p.amount) AS rev
        FROM payments p
        JOIN lead_courses lc ON lc.id = p.lead_course_id
        JOIN leads l ON l.profile_id = p.lead_profile_id AND l.is_deleted = false
        WHERE p.status = 'paid'
          AND p.paid_at BETWEEN :from AND :to
          ${ownerScope}
        UNION ALL
        SELECT l.subsource_id, COALESCE(p.base_amount, p.amount) AS rev
        FROM payments p
        JOIN leads l ON l.profile_id = p.lead_profile_id AND l.is_deleted = false
        WHERE p.status = 'paid'
          AND p.paid_at BETWEEN :from AND :to
          AND p.lead_course_id IS NULL
          ${scopeFilter}
      ) x
      GROUP BY subsource_id
    ),
    conversion_stats AS (
      SELECT l.subsource_id,
             COUNT(*)::int AS conversions
      FROM first_paid fp
      JOIN lead_courses lc ON lc.id = fp.lead_course_id
      JOIN leads l ON l.profile_id = lc.lead_profile_id AND l.is_deleted = false
      WHERE fp.first_paid_at BETWEEN :from AND :to
        ${ownerScope}
      GROUP BY l.subsource_id
    ),
    payment_stats AS (
      SELECT COALESCE(rs.subsource_id, cs.subsource_id) AS subsource_id,
             COALESCE(cs.conversions, 0)::int           AS conversions,
             COALESCE(rs.revenue, 0)::bigint            AS revenue
      FROM revenue_stats rs
      FULL OUTER JOIN conversion_stats cs ON cs.subsource_id = rs.subsource_id
    )
    SELECT ls.subsource_id,
           COALESCE(sub.label, '(direct)') AS subsource_label,
           COALESCE(pr.label, ls.product_id) AS product_label,
           ls.leads,
           COALESCE(ps.conversions, 0) AS conversions,
           COALESCE(ps.revenue, 0) AS revenue
    FROM lead_stats ls
    LEFT JOIN subsources sub ON sub.id = ls.subsource_id
    LEFT JOIN products pr ON pr.id = ls.product_id
    LEFT JOIN payment_stats ps ON ps.subsource_id = ls.subsource_id
    ORDER BY ls.leads DESC
    LIMIT 30
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return rows.map((r) => ({
    subsource_id: r.subsource_id,
    subsource_label: r.subsource_label,
    product_label: r.product_label,
    leads: Number(r.leads),
    conversions: Number(r.conversions),
    revenue: Number(r.revenue),
  }));
}

/**
 * Per-manager scorecard: personal contribution + team aggregate + combined totals.
 */
async function getManagerScorecard({ range }) {
  const replacements = { from: range.from, to: range.to };
  const rows = await sequelize.query(
    `
    WITH managers AS (
      SELECT id, name FROM users WHERE role = 'Manager' AND is_active = true
    ),
    user_scope AS (
      -- (manager_id, user_id_to_count, is_self)
      SELECT m.id AS manager_id, m.id AS user_id, true AS is_self FROM managers m
      UNION ALL
      SELECT u.manager_id AS manager_id, u.id AS user_id, false AS is_self
      FROM users u
      WHERE u.manager_id IN (SELECT id FROM managers) AND u.is_active = true
    ),
    lead_stats AS (
      SELECT us.manager_id, us.is_self,
             COUNT(l.id)::int AS leads
      FROM user_scope us
      LEFT JOIN leads l ON l.agent_id = us.user_id
        AND l.is_deleted = false
        AND l.source_created_at BETWEEN :from AND :to
      GROUP BY us.manager_id, us.is_self
    ),
    -- Distinct (user, profile) pairs — used to attribute STANDALONE payments
    -- (no lead_course) by live lead ownership.
    user_profile_pairs AS (
      SELECT DISTINCT agent_id AS user_id, profile_id
      FROM leads
      WHERE is_deleted = false AND agent_id IS NOT NULL
    ),
    -- Revenue = SUM of paid amounts in window (cash collected, includes
    -- instalments). Hybrid: enrollment-linked payments credit the enrollment's
    -- frozen owner; standalone payments fall back to live lead ownership.
    --
    -- Every figure here is per-manager attribution, so re-enrollments are
    -- excluded unconditionally (decision #9) — same rule as the leaderboard.
    revenue_stats AS (
      SELECT us.manager_id, us.is_self,
             COALESCE(SUM(x.rev), 0)::bigint AS revenue
      FROM (
        SELECT lc.owner_agent_id AS user_id,
               COALESCE(p.base_amount, p.amount) AS rev
        FROM payments p
        JOIN lead_courses lc ON lc.id = p.lead_course_id
        WHERE p.status = 'paid'
          AND p.paid_at BETWEEN :from AND :to
          AND lc.owner_agent_id IS NOT NULL
          AND lc.is_reenrollment = false
        UNION ALL
        SELECT upp.user_id,
               COALESCE(p.base_amount, p.amount) AS rev
        FROM payments p
        JOIN user_profile_pairs upp ON upp.profile_id = p.lead_profile_id
        WHERE p.status = 'paid'
          AND p.paid_at BETWEEN :from AND :to
          AND p.lead_course_id IS NULL
      ) x
      JOIN user_scope us ON us.user_id = x.user_id
      GROUP BY us.manager_id, us.is_self
    ),
    -- Conversions = lead_courses whose FIRST paid payment lands in window
    -- (one per enrolment), credited to the enrollment's frozen owner.
    first_paid AS (
      -- Deferral fees excluded: a conversion is the moment a student first
      -- pays for the COURSE, not for a rescheduling charge.
      SELECT p.lead_course_id, MIN(p.paid_at) AS first_paid_at
      FROM payments p
      WHERE p.status = 'paid' AND p.lead_course_id IS NOT NULL
        AND p.purpose <> 'deferral_fee'
      GROUP BY p.lead_course_id
    ),
    conversion_stats AS (
      SELECT us.manager_id, us.is_self,
             COUNT(*)::int AS conversions
      FROM user_scope us
      JOIN lead_courses lc ON lc.owner_agent_id = us.user_id
      JOIN first_paid fp ON fp.lead_course_id = lc.id
      WHERE fp.first_paid_at BETWEEN :from AND :to
        AND lc.is_reenrollment = false
      GROUP BY us.manager_id, us.is_self
    ),
    payment_stats AS (
      SELECT COALESCE(rs.manager_id, cs.manager_id) AS manager_id,
             COALESCE(rs.is_self, cs.is_self)       AS is_self,
             COALESCE(cs.conversions, 0)::int       AS conversions,
             COALESCE(rs.revenue, 0)::bigint        AS revenue
      FROM revenue_stats rs
      FULL OUTER JOIN conversion_stats cs
        ON cs.manager_id = rs.manager_id AND cs.is_self = rs.is_self
    )
    SELECT m.id AS manager_id,
           m.name AS manager_name,
           COALESCE(SUM(CASE WHEN ls.is_self THEN ls.leads ELSE 0 END), 0)::int AS personal_leads,
           COALESCE(SUM(CASE WHEN NOT ls.is_self THEN ls.leads ELSE 0 END), 0)::int AS team_leads,
           COALESCE(SUM(CASE WHEN ps.is_self THEN ps.conversions ELSE 0 END), 0)::int AS personal_conv,
           COALESCE(SUM(CASE WHEN NOT ps.is_self THEN ps.conversions ELSE 0 END), 0)::int AS team_conv,
           COALESCE(SUM(CASE WHEN ps.is_self THEN ps.revenue ELSE 0 END), 0)::bigint AS personal_revenue,
           COALESCE(SUM(CASE WHEN NOT ps.is_self THEN ps.revenue ELSE 0 END), 0)::bigint AS team_revenue
    FROM managers m
    LEFT JOIN lead_stats ls ON ls.manager_id = m.id
    LEFT JOIN payment_stats ps ON ps.manager_id = m.id AND ps.is_self = ls.is_self
    GROUP BY m.id, m.name
    ORDER BY (
      COALESCE(SUM(CASE WHEN ps.is_self THEN ps.revenue ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN NOT ps.is_self THEN ps.revenue ELSE 0 END), 0)
    ) DESC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return rows.map((r) => ({
    manager_id: r.manager_id,
    manager_name: r.manager_name,
    personal: {
      leads: Number(r.personal_leads),
      conversions: Number(r.personal_conv),
      revenue: Number(r.personal_revenue),
    },
    team: {
      leads: Number(r.team_leads),
      conversions: Number(r.team_conv),
      revenue: Number(r.team_revenue),
    },
    combined: {
      leads: Number(r.personal_leads) + Number(r.team_leads),
      conversions: Number(r.personal_conv) + Number(r.team_conv),
      revenue: Number(r.personal_revenue) + Number(r.team_revenue),
    },
  }));
}

/**
 * SLA stats for first-response on leads arriving in the window.
 * `threshold_minutes` defaults to 24h. A lead is compliant if its first
 * tracked activity arrived within the threshold. A breach is either:
 *   - contacted but later than threshold, OR
 *   - uncontacted AND arrived more than threshold ago (already too late).
 * "Pending" leads arrived recently and could still meet SLA.
 */
async function getSlaStats({ scopedUserIds, range, threshold_minutes = 1440 }) {
  const replacements = {
    from: range.from,
    to: range.to,
    threshold: threshold_minutes,
  };
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) {
      return {
        total_leads: 0,
        total_contacted: 0,
        p50_minutes: null,
        p90_minutes: null,
        within_sla: 0,
        breach: 0,
        pending: 0,
        sla_pct: null,
        threshold_minutes,
      };
    }
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    WITH lead_first AS (
      SELECT
        l.id,
        l.source_created_at,
        (
          SELECT MIN(a.created_at)
          FROM activities a
          WHERE a.lead_id = l.id
            AND a.type IN ('Note','Call','StatusChange','FollowUp')
        ) AS first_at
      FROM leads l
      WHERE l.is_deleted = false
        AND l.source_created_at BETWEEN :from AND :to
        ${scopeClause}
    )
    SELECT
      COUNT(*)::int AS total_leads,
      COUNT(first_at)::int AS total_contacted,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (first_at - source_created_at))/60.0
      ) FILTER (WHERE first_at IS NOT NULL) AS p50_minutes,
      PERCENTILE_CONT(0.9) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (first_at - source_created_at))/60.0
      ) FILTER (WHERE first_at IS NOT NULL) AS p90_minutes,
      COUNT(*) FILTER (
        WHERE first_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (first_at - source_created_at))/60.0 <= :threshold
      )::int AS within_sla,
      COUNT(*) FILTER (
        WHERE (first_at IS NOT NULL
               AND EXTRACT(EPOCH FROM (first_at - source_created_at))/60.0 > :threshold)
           OR (first_at IS NULL
               AND EXTRACT(EPOCH FROM (now() - source_created_at))/60.0 > :threshold)
      )::int AS breach,
      COUNT(*) FILTER (
        WHERE first_at IS NULL
          AND EXTRACT(EPOCH FROM (now() - source_created_at))/60.0 <= :threshold
      )::int AS pending
    FROM lead_first
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  const r = rows[0] || {};
  const total_leads = Number(r.total_leads) || 0;
  const within = Number(r.within_sla) || 0;
  const breach = Number(r.breach) || 0;
  const denom = within + breach;
  return {
    total_leads,
    total_contacted: Number(r.total_contacted) || 0,
    p50_minutes: r.p50_minutes !== null && r.p50_minutes !== undefined ? Number(r.p50_minutes) : null,
    p90_minutes: r.p90_minutes !== null && r.p90_minutes !== undefined ? Number(r.p90_minutes) : null,
    within_sla: within,
    breach,
    pending: Number(r.pending) || 0,
    sla_pct: denom === 0 ? null : Number(((within / denom) * 100).toFixed(1)),
    threshold_minutes,
  };
}

/**
 * Sales-cycle stats: one data point per enrolment (lead_course) whose FIRST
 * paid payment landed in the window. Cycle length = first_paid_at − earliest
 * source_created_at of the linked profile. Reentries don't multiply (we use
 * min(source_created_at) per profile) and instalments don't multiply (one
 * cycle per lead_course, measured to its first paid payment).
 */
async function getSalesCycle({ scopedUserIds, range }) {
  const replacements = { from: range.from, to: range.to };
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) {
      return {
        count: 0,
        avg_days: null,
        p50_days: null,
        p90_days: null,
        histogram: emptyCycleHistogram(),
      };
    }
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    WITH profile_starts AS (
      SELECT l.profile_id, MIN(l.source_created_at) AS first_source_at
      FROM leads l
      WHERE l.is_deleted = false
        ${scopeClause}
      GROUP BY l.profile_id
    ),
    first_paid AS (
      -- Deferral fees excluded: a conversion is the moment a student first
      -- pays for the COURSE, not for a rescheduling charge.
      SELECT p.lead_course_id, MIN(p.paid_at) AS first_paid_at
      FROM payments p
      WHERE p.status = 'paid' AND p.lead_course_id IS NOT NULL
        AND p.purpose <> 'deferral_fee'
      GROUP BY p.lead_course_id
    ),
    durations AS (
      SELECT EXTRACT(EPOCH FROM (fp.first_paid_at - ps.first_source_at))/86400.0 AS days
      FROM first_paid fp
      JOIN lead_courses lc ON lc.id = fp.lead_course_id
      JOIN profile_starts ps ON ps.profile_id = lc.lead_profile_id
      WHERE fp.first_paid_at BETWEEN :from AND :to
        AND ps.first_source_at IS NOT NULL
        AND fp.first_paid_at >= ps.first_source_at
    )
    SELECT
      COUNT(*)::int AS count,
      AVG(days)::float AS avg_days,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days)::float AS p50_days,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY days)::float AS p90_days,
      COUNT(*) FILTER (WHERE days <= 7)::int                       AS b_0_7,
      COUNT(*) FILTER (WHERE days > 7  AND days <= 14)::int        AS b_8_14,
      COUNT(*) FILTER (WHERE days > 14 AND days <= 30)::int        AS b_15_30,
      COUNT(*) FILTER (WHERE days > 30 AND days <= 60)::int        AS b_31_60,
      COUNT(*) FILTER (WHERE days > 60)::int                       AS b_60p
    FROM durations
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  const r = rows[0] || {};
  return {
    count: Number(r.count) || 0,
    avg_days: r.avg_days !== null && r.avg_days !== undefined ? Number(r.avg_days) : null,
    p50_days: r.p50_days !== null && r.p50_days !== undefined ? Number(r.p50_days) : null,
    p90_days: r.p90_days !== null && r.p90_days !== undefined ? Number(r.p90_days) : null,
    histogram: [
      { bucket: '0_7', label: '0–7d', count: Number(r.b_0_7) || 0 },
      { bucket: '8_14', label: '8–14d', count: Number(r.b_8_14) || 0 },
      { bucket: '15_30', label: '15–30d', count: Number(r.b_15_30) || 0 },
      { bucket: '31_60', label: '31–60d', count: Number(r.b_31_60) || 0 },
      { bucket: '60p', label: '60d+', count: Number(r.b_60p) || 0 },
    ],
  };
}

function emptyCycleHistogram() {
  return [
    { bucket: '0_7', label: '0–7d', count: 0 },
    { bucket: '8_14', label: '8–14d', count: 0 },
    { bucket: '15_30', label: '15–30d', count: 0 },
    { bucket: '31_60', label: '31–60d', count: 0 },
    { bucket: '60p', label: '60d+', count: 0 },
  ];
}

/**
 * Average dwell time per stage, computed from the StatusChange activity log.
 * For each transition, the OLD status is being exited and the time spent in
 * it = activity.created_at - (previous transition OR lead.source_created_at).
 * Returns one row per status that has at least one observed exit.
 *
 * Not windowed — uses the lifetime activity history so even sparse stages
 * have data. Scope is applied via current lead.agent_id.
 */
async function getTimeInStage({ scopedUserIds }) {
  const replacements = {};
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return { rows: [] };
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    WITH events AS (
      SELECT
        a.lead_id,
        a.created_at AS exited_at,
        (a.metadata->'old'->>'status_id') AS exited_status_id,
        LAG(a.created_at) OVER (PARTITION BY a.lead_id ORDER BY a.created_at) AS prev_at,
        l.source_created_at
      FROM activities a
      JOIN leads l ON l.id = a.lead_id
      WHERE a.type = 'StatusChange'
        AND a.title <> 'Loss Reason Updated'
        AND l.is_deleted = false
        ${scopeClause}
    ),
    durations AS (
      SELECT
        exited_status_id AS status_id,
        EXTRACT(EPOCH FROM (exited_at - COALESCE(prev_at, source_created_at)))/86400.0 AS days
      FROM events
      WHERE exited_status_id IS NOT NULL
        AND COALESCE(prev_at, source_created_at) IS NOT NULL
        AND exited_at >= COALESCE(prev_at, source_created_at)
    )
    SELECT
      d.status_id,
      s.label,
      s.color,
      s.sort_order,
      AVG(d.days)::float AS avg_days,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d.days)::float AS p50_days,
      COUNT(*)::int AS sample_size
    FROM durations d
    JOIN statuses s ON s.id = d.status_id
    GROUP BY d.status_id, s.label, s.color, s.sort_order
    ORDER BY s.sort_order ASC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return {
    rows: rows.map((r) => ({
      status_id: r.status_id,
      label: r.label,
      color: r.color,
      sort_order: Number(r.sort_order),
      avg_days: r.avg_days !== null && r.avg_days !== undefined ? Number(r.avg_days) : null,
      p50_days: r.p50_days !== null && r.p50_days !== undefined ? Number(r.p50_days) : null,
      sample_size: Number(r.sample_size) || 0,
    })),
  };
}

/**
 * Aging matrix: for each currently-open lead, bucket by (status × time since
 * last update). Surfaces stuck leads needing intervention.
 */
async function getAgingBuckets({ scopedUserIds }) {
  const replacements = {};
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) {
      const statuses = await Status.findAll({
        where: { is_deactivated: false },
        order: [['sort_order', 'ASC']],
        raw: true,
      });
      return {
        statuses: statuses.map((s) => ({
          id: s.id, label: s.label, color: s.color, sort_order: s.sort_order,
        })),
        buckets: AGING_BUCKETS,
        matrix: [],
        bucket_totals: Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])),
      };
    }
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const rows = await sequelize.query(
    `
    SELECT
      l.status_id,
      CASE
        WHEN now() - l.lead_update_date < interval '4 days'  THEN '0-3d'
        WHEN now() - l.lead_update_date < interval '8 days'  THEN '4-7d'
        WHEN now() - l.lead_update_date < interval '15 days' THEN '8-14d'
        WHEN now() - l.lead_update_date < interval '31 days' THEN '15-30d'
        ELSE '30d+'
      END AS bucket,
      COUNT(*)::int AS count
    FROM leads l
    WHERE l.is_deleted = false
      ${scopeClause}
    GROUP BY l.status_id, bucket
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  const statuses = await Status.findAll({
    where: { is_deactivated: false },
    order: [['sort_order', 'ASC']],
    raw: true,
  });

  const bucket_totals = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));
  const matrix = rows.map((r) => {
    const c = Number(r.count) || 0;
    bucket_totals[r.bucket] = (bucket_totals[r.bucket] || 0) + c;
    return { status_id: r.status_id, bucket: r.bucket, count: c };
  });

  return {
    statuses: statuses.map((s) => ({
      id: s.id, label: s.label, color: s.color, sort_order: s.sort_order,
    })),
    buckets: AGING_BUCKETS,
    matrix,
    bucket_totals,
  };
}

const AGING_BUCKETS = ['0-3d', '4-7d', '8-14d', '15-30d', '30d+'];

/**
 * Aggregate `loss_reason` text across leads with a final non-empty reason.
 * Period filter applies to lead.lead_update_date (when the loss was recorded).
 * Returns top-N reasons with counts + an estimate of revenue at risk (sum of
 * paid amounts for that profile that were never realised — proxied by the
 * largest course price among the lead's lead_courses if available).
 */
async function getLossReasons({ scopedUserIds, range, limit = 10 }) {
  const replacements = { from: range.from, to: range.to };
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return { rows: [] };
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }
  replacements.lim = Number(limit) || 10;

  const rows = await sequelize.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(l.loss_reason), ''), '(unspecified)') AS reason,
      COUNT(*)::int AS count,
      COALESCE(SUM(lc.max_fee), 0)::bigint AS revenue_at_risk
    FROM leads l
    LEFT JOIN LATERAL (
      SELECT MAX(final_fee) AS max_fee
      FROM lead_courses
      WHERE lead_profile_id = l.profile_id
    ) lc ON TRUE
    WHERE l.is_deleted = false
      AND l.loss_reason IS NOT NULL
      AND TRIM(l.loss_reason) <> ''
      AND l.lead_update_date BETWEEN :from AND :to
      ${scopeClause}
    GROUP BY reason
    ORDER BY count DESC
    LIMIT :lim
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  return {
    rows: rows.map((r) => ({
      reason: r.reason,
      count: Number(r.count) || 0,
      revenue_at_risk: Number(r.revenue_at_risk) || 0,
    })),
  };
}

/**
 * Weighted pipeline forecast — for each open lead, weighted_value =
 * (estimated course fee) × (historical conversion rate of its current stage).
 * Returns per-status rollups and a single total.
 *
 * Stage win-rate is computed from historical lead lifetime: leads with at
 * least one PAID payment count as "won". For each lead we take its FIRST
 * status (the create event) — but to keep this query simple and useful we
 * approximate by computing per-status: (leads currently or previously at this
 * stage that ended up converting) / (total leads that ever sat at this stage).
 *
 * Approximation used here: leads created in the last 180 days, grouped by
 * their current status_id, with win = profile has any PAID payment. This is
 * a directional metric — not perfect, but stable for forecasting.
 */
async function getForecast({ scopedUserIds }) {
  const replacements = {};
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) {
      return { rows: [], total_weighted: 0, total_pipeline: 0 };
    }
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  // 1. Per-status historical win rate over the last 180 days
  const winRateRows = await sequelize.query(
    `
    WITH historical AS (
      SELECT DISTINCT ON (l.id)
        l.id,
        l.status_id,
        l.profile_id
      FROM leads l
      WHERE l.is_deleted = false
        AND l.source_created_at >= now() - interval '180 days'
        ${scopeClause}
    ),
    won AS (
      SELECT DISTINCT lead_profile_id AS profile_id
      FROM payments
      WHERE status = 'paid'
    )
    SELECT
      h.status_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE w.profile_id IS NOT NULL)::int AS wins
    FROM historical h
    LEFT JOIN won w ON w.profile_id = h.profile_id
    GROUP BY h.status_id
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );
  const winRateByStatus = new Map();
  for (const r of winRateRows) {
    const total = Number(r.total) || 0;
    const wins = Number(r.wins) || 0;
    winRateByStatus.set(r.status_id, total > 0 ? wins / total : 0);
  }

  // 2. Currently open pipeline (open = any status, snapshot) — value proxied by
  //    MAX(final_fee) of the profile's lead_courses.
  //
  //    Dropped enrollments are excluded: this is a FORWARD-looking figure, and
  //    a fee nobody will ever pay is not pipeline. (Contrast revenue_total in
  //    sumRevenue, which deliberately keeps them — money already received is
  //    backward-looking and stays.)
  const openRows = await sequelize.query(
    `
    SELECT
      l.status_id,
      COUNT(*)::int AS open_count,
      COALESCE(SUM(lc.max_fee), 0)::bigint AS pipeline_value
    FROM leads l
    LEFT JOIN LATERAL (
      SELECT MAX(final_fee) AS max_fee
      FROM lead_courses
      WHERE lead_profile_id = l.profile_id
        AND status = 'active'
    ) lc ON TRUE
    WHERE l.is_deleted = false
      ${scopeClause}
    GROUP BY l.status_id
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );

  const statuses = await Status.findAll({
    where: { is_deactivated: false },
    order: [['sort_order', 'ASC']],
    raw: true,
  });
  const statusMap = new Map(statuses.map((s) => [s.id, s]));

  let total_weighted = 0;
  let total_pipeline = 0;
  const rows = openRows.map((r) => {
    const s = statusMap.get(r.status_id);
    const win_rate = winRateByStatus.get(r.status_id) ?? 0;
    const pipeline_value = Number(r.pipeline_value) || 0;
    const open_count = Number(r.open_count) || 0;
    const weighted = pipeline_value * win_rate;
    total_pipeline += pipeline_value;
    total_weighted += weighted;
    return {
      status_id: r.status_id,
      label: s?.label || r.status_id,
      color: s?.color || '#94a3b8',
      sort_order: s?.sort_order ?? 999,
      open_count,
      pipeline_value,
      win_rate: Number((win_rate * 100).toFixed(1)),
      weighted_value: Math.round(weighted),
    };
  });

  rows.sort((a, b) => a.sort_order - b.sort_order);
  return {
    rows,
    total_weighted: Math.round(total_weighted),
    total_pipeline,
  };
}

/**
 * Health/alerts: returns counts of actionable signals.
 *  - stuck_open: open leads with no update in 14d
 *  - sla_breach: leads in last 7d whose first response was late OR uncontacted past threshold
 *  - high_intent_unassigned: profile.intent='High' leads with agent_id null
 *  - overdue_followups: next_followup < now() and lead open
 */
async function getAlerts({ scopedUserIds }) {
  const replacements = {};
  let scopeClause = '';
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) {
      return {
        stuck_open: 0, sla_breach: 0, high_intent_unassigned: 0, overdue_followups: 0,
      };
    }
    scopeClause = `AND l.agent_id IN (:agents)`;
    replacements.agents = scopedUserIds;
  }

  const startOfToday = startOfLocalToday();
  replacements.startOfToday = startOfToday;

  const rows = await sequelize.query(
    `
    WITH lead_first AS (
      SELECT
        l.id,
        l.source_created_at,
        l.lead_update_date,
        l.next_followup,
        l.agent_id,
        l.profile_id,
        (
          SELECT MIN(a.created_at)
          FROM activities a
          WHERE a.lead_id = l.id
            AND a.type IN ('Note','Call','StatusChange','FollowUp')
        ) AS first_at
      FROM leads l
      WHERE l.is_deleted = false
        ${scopeClause}
    )
    SELECT
      COUNT(*) FILTER (
        WHERE now() - lead_update_date > interval '14 days'
      )::int AS stuck_open,
      COUNT(*) FILTER (
        WHERE source_created_at >= now() - interval '7 days'
          AND (
            (first_at IS NOT NULL AND EXTRACT(EPOCH FROM (first_at - source_created_at))/60.0 > 1440)
            OR (first_at IS NULL AND EXTRACT(EPOCH FROM (now() - source_created_at))/60.0 > 1440)
          )
      )::int AS sla_breach,
      COUNT(*) FILTER (
        WHERE agent_id IS NULL
          AND profile_id IN (SELECT id FROM lead_profiles WHERE intent = 'High')
      )::int AS high_intent_unassigned,
      COUNT(*) FILTER (
        WHERE next_followup IS NOT NULL AND next_followup < :startOfToday
      )::int AS overdue_followups
    FROM lead_first
    `,
    { replacements, type: sequelize.QueryTypes.SELECT },
  );
  const r = rows[0] || {};
  return {
    stuck_open: Number(r.stuck_open) || 0,
    sla_breach: Number(r.sla_breach) || 0,
    high_intent_unassigned: Number(r.high_intent_unassigned) || 0,
    overdue_followups: Number(r.overdue_followups) || 0,
  };
}

module.exports = {
  buildLeadWhere,
  localDateTrunc,
  countLeads,
  sumRevenue,
  avgTimeToFirstContact,
  countActiveAgents,
  countMyOpenLeads,
  getScopedUserIds,
  getQueue,
  getFunnel,
  getActivityFeed,
  getWeeklyTrend,
  getLeaderboard,
  getWorkload,
  getFollowupHeatmap,
  getUnassignedLeads,
  getTimeseries,
  getProductMatrix,
  getSourcePerformance,
  getManagerScorecard,
  getSlaStats,
  getSalesCycle,
  getTimeInStage,
  getAgingBuckets,
  getLossReasons,
  getForecast,
  getAlerts,
};

