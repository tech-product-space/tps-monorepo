const { sequelize } = require('../models');
const { localDateTrunc } = require('./dashboard.service');

/**
 * Status-entry report: every lead that ENTERED a given status within the
 * window, sourced from the StatusChange activity log (metadata.new.status_id).
 * Alongside raw entry counts it splits unique leads into still-in-status vs
 * moved-out — the "moved out" set is the one that silently gets lost when
 * someone else changes a lead's status later.
 *
 * A lead entering the status twice in the window counts twice in
 * total_entries but once in unique_leads. Scope/breakdown follow the current
 * lead owner (l.agent_id), matching the rest of the dashboard; the per-row
 * actor shows who actually made each change.
 */
async function getStatusEntryReport({ scopedUserIds, range, statusId, productId, agentIds }) {
  // Intersect the caller's role scope with an optional explicit agent filter.
  let agents = scopedUserIds;
  if (agentIds && agentIds.length) {
    agents = scopedUserIds === null
      ? agentIds
      : agentIds.filter((id) => scopedUserIds.includes(id));
  }

  const empty = {
    summary: { total_entries: 0, unique_leads: 0, still_in_status: 0, moved_out: 0 },
    by_agent: [],
    by_day: [],
    rows: [],
  };
  if (agents !== null && agents.length === 0) return empty;

  const replacements = { statusId, from: range.from, to: range.to };
  let scopeClause = '';
  if (agents !== null) {
    scopeClause = 'AND l.agent_id IN (:agents)';
    replacements.agents = agents;
  }
  let productClause = '';
  if (productId) {
    productClause = 'AND l.product_id = :productId';
    replacements.productId = productId;
  }

  const baseFromWhere = `
    FROM activities a
    JOIN leads l ON l.id = a.lead_id AND l.is_deleted = false
    WHERE a.type = 'StatusChange'
      AND a.title <> 'Loss Reason Updated'
      AND a.metadata->'new'->>'status_id' = :statusId
      AND a.created_at BETWEEN :from AND :to
      ${scopeClause}
      ${productClause}
  `;

  const [summaryRows, byAgent, byDay, rows] = await Promise.all([
    sequelize.query(
      `
      SELECT
        COUNT(*)::int AS total_entries,
        COUNT(DISTINCT a.lead_id)::int AS unique_leads,
        COUNT(DISTINCT a.lead_id) FILTER (WHERE l.status_id = :statusId)::int AS still_in_status,
        COUNT(DISTINCT a.lead_id) FILTER (WHERE l.status_id <> :statusId)::int AS moved_out
      ${baseFromWhere}
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    sequelize.query(
      `
      SELECT
        l.agent_id,
        u.name AS agent_name,
        COUNT(*)::int AS entries,
        COUNT(DISTINCT a.lead_id)::int AS unique_leads
      FROM activities a
      JOIN leads l ON l.id = a.lead_id AND l.is_deleted = false
      LEFT JOIN users u ON u.id = l.agent_id
      WHERE a.type = 'StatusChange'
        AND a.title <> 'Loss Reason Updated'
        AND a.metadata->'new'->>'status_id' = :statusId
        AND a.created_at BETWEEN :from AND :to
        ${scopeClause}
        ${productClause}
      GROUP BY l.agent_id, u.name
      ORDER BY entries DESC
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    sequelize.query(
      `
      SELECT
        ${localDateTrunc('day', 'a.created_at')} AS day,
        COUNT(*)::int AS entries
      ${baseFromWhere}
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    sequelize.query(
      `
      SELECT
        a.id AS activity_id,
        a.lead_id,
        l.profile_id,
        p.name AS lead_name,
        p.phone,
        p.country_code,
        a.created_at AS entered_at,
        actor.name AS actor_name,
        l.status_id AS current_status_id,
        s.label AS current_status_label,
        s.color AS current_status_color,
        l.agent_id,
        u.name AS agent_name,
        l.product_id
      FROM activities a
      JOIN leads l ON l.id = a.lead_id AND l.is_deleted = false
      JOIN lead_profiles p ON p.id = l.profile_id
      LEFT JOIN statuses s ON s.id = l.status_id
      LEFT JOIN users u ON u.id = l.agent_id
      LEFT JOIN users actor ON actor.id = a.actor_id
      WHERE a.type = 'StatusChange'
        AND a.title <> 'Loss Reason Updated'
        AND a.metadata->'new'->>'status_id' = :statusId
        AND a.created_at BETWEEN :from AND :to
        ${scopeClause}
        ${productClause}
      ORDER BY a.created_at DESC
      LIMIT 1000
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
  ]);

  return {
    summary: summaryRows[0] || empty.summary,
    by_agent: byAgent,
    by_day: byDay,
    rows,
  };
}

module.exports = {
  getStatusEntryReport,
};
