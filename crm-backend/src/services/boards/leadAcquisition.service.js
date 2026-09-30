const { sequelize } = require('../../models');
const { localDateTrunc } = require('../dashboard.service');
const {
  resolveAgentScope,
  buildScopeClauses,
  buildArrivalsCte,
} = require('./_arrivals');

/**
 * Lead Acquisition board: what each channel delivered in a period, beside what
 * it delivered in the comparable period before.
 *
 * The arrival grain — which rows count, when they count, and who they are
 * credited to — lives in `_arrivals.js` and is shared with the Lead Status
 * board, so the two can never disagree about how many leads arrived. Read that
 * file first; it carries the reasoning this board is built on.
 *
 * Both windows are selected from the one CTE, so a single scan serves the
 * current period, the previous period and the daily trend.
 */

async function getLeadAcquisition({
  scopedUserIds,
  period,
  previous,
  productIds,
  subsourceIds,
  agentIds,
}) {
  const empty = {
    kpis: {
      total_new_leads: 0,
      total_previous_leads: 0,
      distinct_people: 0,
      fresh: 0,
      returning_leads: 0,
    },
    rows: [],
    by_day: [],
  };

  const scope = resolveAgentScope(scopedUserIds, agentIds);
  if (scope.isEmpty) return empty;

  const replacements = {
    from: period.from,
    to: period.to,
  };

  const { scopeClause, productClause } = buildScopeClauses(
    { ...scope, productIds, subsourceIds },
    replacements,
  );

  const hasPrevious = !!previous;
  if (hasPrevious) {
    replacements.prevFrom = previous.from;
    replacements.prevTo = previous.to;
  }

  // Every bound is cast explicitly: replacements arrive as untyped literals, so
  // LEAST/GREATEST would resolve them as text and the comparison against a
  // timestamptz column fails outright.
  const CURRENT =
    'ev.event_time >= :from::timestamptz AND ev.event_time <= :to::timestamptz';
  // A cohort's predecessor is a real window of its own, not a shift off `from`,
  // so it carries both its own bounds.
  const PREVIOUS = hasPrevious
    ? 'ev.event_time >= :prevFrom::timestamptz AND ev.event_time <= :prevTo::timestamptz'
    : 'false';

  // Widest span the CTE needs to cover, so the scan reads each window once.
  const SPAN = hasPrevious
    ? '(ev.event_time >= LEAST(:from::timestamptz, :prevFrom::timestamptz)'
      + ' AND ev.event_time <= GREATEST(:to::timestamptz, :prevTo::timestamptz))'
    : CURRENT;

  const cte = buildArrivalsCte({ scopeClause, productClause });

  const counters = `
    COUNT(*) FILTER (WHERE ${CURRENT})::int AS new_leads,
    COUNT(*) FILTER (WHERE ${PREVIOUS})::int AS previous_leads,
    COUNT(*) FILTER (WHERE ${CURRENT} AND ev.change_type = 'created')::int AS fresh,
    COUNT(*) FILTER (WHERE ${CURRENT} AND ev.change_type <> 'created')::int AS returning_leads,
    COUNT(DISTINCT ev.profile_id) FILTER (WHERE ${CURRENT})::int AS distinct_people
  `;

  const [grouped, kpiRows, byDay] = await Promise.all([
    // One pass at product x subsource grain; the product totals are rolled up
    // in JS below so a parent can never disagree with the sum of its children.
    sequelize.query(
      `
      ${cte}
      SELECT
        COALESCE(ev.product_id, 'Unknown') AS product_id,
        ev.subsource_id,
        COALESCE(s.label, ev.subsource_id, 'Unknown') AS subsource_label,
        ${counters}
      FROM ev
      LEFT JOIN subsources s ON s.id = ev.subsource_id
      WHERE ${SPAN}
      GROUP BY 1, 2, 3
      ORDER BY new_leads DESC
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    // Totals are queried, not summed from the rows above: distinct_people
    // cannot be added up across groups without double-counting anyone who
    // arrived for more than one product.
    sequelize.query(
      `
      ${cte}
      SELECT ${counters}
      FROM ev
      WHERE ${SPAN}
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    sequelize.query(
      `
      ${cte}
      SELECT
        ${localDateTrunc('day', 'ev.event_time')} AS day,
        COUNT(*)::int AS leads
      FROM ev
      WHERE ${CURRENT}
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
  ]);

  const kpi = kpiRows[0] || {};
  const totalNew = kpi.new_leads || 0;

  // Roll the flat product x subsource result into the board's tree.
  const byProduct = new Map();
  for (const r of grouped) {
    if (!byProduct.has(r.product_id)) {
      byProduct.set(r.product_id, {
        product_id: r.product_id,
        new_leads: 0,
        previous_leads: 0,
        fresh: 0,
        returning_leads: 0,
        distinct_people: 0,
        subsources: [],
      });
    }
    const node = byProduct.get(r.product_id);
    node.new_leads += r.new_leads;
    node.previous_leads += r.previous_leads;
    node.fresh += r.fresh;
    node.returning_leads += r.returning_leads;
    // Summed, so it over-counts anyone who arrived through two subsources of
    // the same product. Named to say so rather than pretending to be distinct.
    node.distinct_people += r.distinct_people;

    // A subsource with nothing in either window is an artefact of the join, not
    // a channel worth a row.
    if (r.new_leads || r.previous_leads) {
      node.subsources.push({
        subsource_id: r.subsource_id,
        label: r.subsource_label,
        new_leads: r.new_leads,
        previous_leads: r.previous_leads,
        fresh: r.fresh,
        returning_leads: r.returning_leads,
        // Share OF THE PRODUCT, not of the grand total — filled in below once
        // the parent's own total is known.
        pct_of_parent: 0,
      });
    }
  }

  const rows = [...byProduct.values()]
    .filter((p) => p.new_leads || p.previous_leads)
    .map((p) => {
      p.subsources.sort((a, b) => b.new_leads - a.new_leads);
      for (const sub of p.subsources) {
        sub.pct_of_parent = p.new_leads
          ? Number(((sub.new_leads / p.new_leads) * 100).toFixed(1))
          : 0;
      }
      return {
        ...p,
        pct_of_total: totalNew
          ? Number(((p.new_leads / totalNew) * 100).toFixed(1))
          : 0,
      };
    })
    .sort((a, b) => b.new_leads - a.new_leads);

  return {
    kpis: {
      total_new_leads: totalNew,
      total_previous_leads: kpi.previous_leads || 0,
      distinct_people: kpi.distinct_people || 0,
      fresh: kpi.fresh || 0,
      returning_leads: kpi.returning_leads || 0,
    },
    rows,
    by_day: byDay,
  };
}

module.exports = { getLeadAcquisition };
