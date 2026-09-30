const { sequelize, Status } = require('../../models');
const {
  ARRIVAL_STATUS_IDS,
  resolveAgentScope,
  buildScopeClauses,
  buildArrivalsCte,
} = require('./_arrivals');

/**
 * Lead Status board: the Lead Acquisition arrival set, re-cut by status.
 *
 * Acquisition answers "how many arrived, from where". This answers the next
 * question — "and where did they get to" — over exactly the same arrivals, so
 * the Total column here equals New Leads there for any given filter set. That
 * equality is the board's acceptance test; if it ever fails, one of the two is
 * lying and neither can be trusted.
 *
 * ── Which status each arrival is counted under ───────────────────────────────
 * `statusAsOf` decides, and it defaults to LIVE:
 *
 *   'now'          Every row takes the lead's status TODAY. The board then
 *                  agrees with the Leads page, the dashboard and the reports,
 *                  which is what it is asked for in practice — someone
 *                  reviewing yesterday's intake wants to know where those leads
 *                  stand now, not where they stood at midnight.
 *
 *   'window_close' Each row takes the status its lead held at the closing edge
 *                  of ITS OWN window — current at `period.to`, previous at
 *                  `previous.to`.
 *
 * The trade is real and runs in both directions. Under 'now' the previous
 * table is AGE-BIASED: last week's arrivals have had a week longer to move down
 * the funnel, so that table will always look further along, and the difference
 * is time rather than performance. The UI says so on the page rather than
 * leaving a reader to work it out.
 *
 * 'window_close' removes exactly that bias, because periodResolver already
 * truncates the previous window to the same elapsed slice ("Last week, same
 * point") — so it compares a 3.2-day-old cohort against a 3.2-day-old one. It
 * costs agreement with every other page in the CRM, which is why it is not the
 * default. Cohort mode is beyond either fix: two cohorts are genuinely
 * different lengths, so the UI leads with share-of-row there rather than counts.
 *
 * ── Reconstructing a past status ─────────────────────────────────────────────
 * There is no status-history table, so past status is rebuilt from the activity
 * log. The trap: `leads.status_id` has three writers and only two are typed
 * `StatusChange` — the re-entry flip to `s_reentry` is logged as `System`
 * (lead.service.js). Filtering on `type = 'StatusChange'` alone, as
 * report.service.js does, silently misses every re-entry and mis-dates exactly
 * the Re-entry column. Both writers share the same
 * `{ old: { status_id }, new: { status_id } }` metadata shape, so the filter
 * below selects on that shape rather than on the type.
 */

/**
 * Whether a window can just read `leads.status_id` instead of reconstructing.
 *
 * Always true under statusAsOf='now'. Under 'window_close' it is still true for
 * a window that closes at now — Today and This week — because there is nothing
 * to rewind to.
 *
 * `period.to` for a running period is stamped in Node, a moment before the
 * query reaches Postgres, so comparing it to the database's `now()` would fail
 * by a few milliseconds of clock skew and pay for a rewind that cannot change
 * any answer. Decided here in JS instead, where both timestamps are ours.
 */
const LIVE_EDGE_SLACK_MS = 60 * 1000;

const readsLive = (to, statusAsOf) =>
  statusAsOf !== 'window_close' ||
  new Date(to).getTime() >= Date.now() - LIVE_EDGE_SLACK_MS;

/**
 * The CTEs that resolve every touched lead's status at `:atParam`.
 *
 * When the window closes at now there is nothing to reconstruct — the live
 * column IS the answer, and that covers Today and This week, the two periods
 * anyone actually leaves open.
 *
 * Otherwise: ONE pass over the status-carrying activities of the leads in the
 * window, then two `DISTINCT ON` sorts. The obvious implementation — a pair of
 * correlated `LIMIT 1` subqueries per lead — is what this replaced, and it was
 * roughly twenty times slower on a two-month range. The reason is the second
 * lookup: for a lead that has never had a status change (two thirds of them,
 * since most arrivals are never worked) it can only prove the absence by
 * walking every activity that lead has, and it pays that walk per lead.
 * Sorting a set already filtered to status-carrying rows finds the same answer
 * in one pass and skips the leads that have no rows at all.
 *
 * Note the deliberate absence of the `?` JSONB key-exists operator: Sequelize's
 * replacement parser also treats `?` as a placeholder, so an `IS NOT NULL` test
 * on the extracted text is used instead. Same result, no ambiguity.
 */
function resolvedCte(atParam, live) {
  if (live) {
    return `
    , resolved AS (
      SELECT l.id AS lead_id, l.status_id
      FROM leads l
      JOIN (SELECT DISTINCT win.lead_id FROM win) touched ON touched.lead_id = l.id
    )`;
  }

  return `
    -- Where every lead in the window STARTED, taken from the arrival itself.
    --
    -- An arrival's status is not something to look up: lead.service.js inserts
    -- a first contact as s_new and flips a re-entry to s_reentry, so the
    -- change_type on the history row already says which. And the newest arrival
    -- at or before the instant is simply the newest arrival IN the window,
    -- because the window closes at that instant — nothing can have arrived
    -- between the two.
    --
    -- This replaced a second correlated pass that recovered the same fact from
    -- the OLDEST activity's old.status_id. That pass had to prove a negative
    -- for every never-worked lead — two thirds of them — and cost more than the
    -- rest of the board put together.
    , arrival_status AS (
      SELECT DISTINCT ON (win.lead_id)
        win.lead_id,
        win.event_time AS marked_at,
        CASE WHEN win.change_type = 'created' THEN 's_new' ELSE 's_reentry' END
          AS status_id
      FROM win
      ORDER BY win.lead_id, win.event_time DESC
    )
    -- Every status write at or before the instant. Both writers of
    -- leads.status_id are selected by METADATA SHAPE, not by type: the re-entry
    -- flip to s_reentry is logged as 'System', and a type-only filter would
    -- silently mis-date the entire Re-entry column.
    --
    -- Deliberately NOT joined to the window's leads. Restricting it that way
    -- reads plausibly but plans far worse — measured at six times the cost of
    -- scanning the whole set, which is only ~68k rows. The hash join below
    -- narrows it for free.
    , latest_change AS (
      SELECT DISTINCT ON (a.lead_id)
        a.lead_id,
        a.created_at AS changed_at,
        a.metadata->'new'->>'status_id' AS status_id
      FROM activities a
      WHERE a.type IN ('StatusChange', 'System')
        AND a.title <> 'Loss Reason Updated'
        AND a.metadata->'new'->>'status_id' IS NOT NULL
        AND a.created_at <= :${atParam}::timestamptz
      ORDER BY a.lead_id, a.created_at DESC
    )
    -- Whichever spoke last wins. A re-entry logs an activity of its own at the
    -- same instant it flips the status, so the tie goes to the change and both
    -- paths agree on s_reentry either way.
    , resolved AS (
      SELECT
        arrival_status.lead_id,
        CASE
          WHEN latest_change.lead_id IS NOT NULL
           AND latest_change.changed_at >= arrival_status.marked_at
          THEN latest_change.status_id
          ELSE arrival_status.status_id
        END AS status_id
      FROM arrival_status
      LEFT JOIN latest_change ON latest_change.lead_id = arrival_status.lead_id
    )`;
}

/**
 * Arrivals in one window, at (product x subsource x status) grain.
 *
 * Status is resolved once per DISTINCT lead, never per arrival — status belongs
 * to the lead, so resolving it per arrival re-answers the same question once
 * per re-entry.
 */
function windowQuery({ cte, fromParam, toParam, atParam, live }) {
  return `
    ${cte}
    , win AS MATERIALIZED (
      SELECT ev.*
      FROM ev
      WHERE ev.event_time >= :${fromParam}::timestamptz
        AND ev.event_time <= :${toParam}::timestamptz
    )
    ${resolvedCte(atParam, live)}
    SELECT
      COALESCE(win.product_id, 'Unknown') AS product_id,
      win.subsource_id,
      COALESCE(s.label, win.subsource_id, 'Unknown') AS subsource_label,
      resolved.status_id,
      COUNT(*)::int AS n
    FROM win
    JOIN resolved ON resolved.lead_id = win.lead_id
    LEFT JOIN subsources s ON s.id = win.subsource_id
    GROUP BY 1, 2, 3, 4
  `;
}

/**
 * Roll the flat (product, subsource, status) result into the board's tree.
 *
 * Subsource nodes accumulate; product nodes are DERIVED by summing them. A
 * parent that counted independently could disagree with the sum of its
 * children, and in a matrix that discrepancy is invisible until someone adds a
 * column up by hand.
 */
function rollup(grouped) {
  const products = new Map();

  for (const r of grouped) {
    if (!products.has(r.product_id)) {
      products.set(r.product_id, { product_id: r.product_id, subs: new Map() });
    }
    const product = products.get(r.product_id);

    // Null subsource is a real bucket (leads that arrived with no channel), so
    // it is keyed on a sentinel rather than dropped.
    const key = r.subsource_id ?? ' none';
    if (!product.subs.has(key)) {
      product.subs.set(key, {
        subsource_id: r.subsource_id,
        label: r.subsource_label,
        by_status: {},
        total: 0,
      });
    }
    const sub = product.subs.get(key);
    const statusId = r.status_id || 'Unknown';
    sub.by_status[statusId] = (sub.by_status[statusId] || 0) + r.n;
    sub.total += r.n;
  }

  const rows = [];
  for (const product of products.values()) {
    const subsources = [...product.subs.values()].sort(
      (a, b) => b.total - a.total,
    );
    const by_status = {};
    let total = 0;
    for (const sub of subsources) {
      for (const [statusId, n] of Object.entries(sub.by_status)) {
        by_status[statusId] = (by_status[statusId] || 0) + n;
      }
      total += sub.total;
    }
    rows.push({ product_id: product.product_id, by_status, total, subsources });
  }

  rows.sort((a, b) => b.total - a.total);

  const totals = { by_status: {}, total: 0 };
  for (const row of rows) {
    for (const [statusId, n] of Object.entries(row.by_status)) {
      totals.by_status[statusId] = (totals.by_status[statusId] || 0) + n;
    }
    totals.total += row.total;
  }

  return { rows, totals };
}

/** Every status column, zero-filled, so no cell can render as `undefined`. */
function zeroFill(window, statusIds) {
  const fill = (map) => {
    const out = {};
    for (const id of statusIds) out[id] = map[id] || 0;
    return out;
  };
  return {
    rows: window.rows.map((row) => ({
      product_id: row.product_id,
      by_status: fill(row.by_status),
      total: row.total,
      pct_of_total: window.totals.total
        ? Number(((row.total / window.totals.total) * 100).toFixed(1))
        : 0,
      subsources: row.subsources.map((sub) => ({
        subsource_id: sub.subsource_id,
        label: sub.label,
        by_status: fill(sub.by_status),
        total: sub.total,
        // Share OF THE PRODUCT, not of the grand total.
        pct_of_parent: row.total
          ? Number(((sub.total / row.total) * 100).toFixed(1))
          : 0,
      })),
    })),
    totals: { by_status: fill(window.totals.by_status), total: window.totals.total },
  };
}

const EMPTY_WINDOW = { rows: [], totals: { by_status: {}, total: 0 } };

async function getLeadStatus({
  scopedUserIds,
  period,
  previous,
  productIds,
  subsourceIds,
  agentIds,
  // 'now' | 'window_close' — see the note at the top of this file. Live is the
  // default so the board agrees with the Leads page.
  statusAsOf = 'now',
}) {
  const scope = resolveAgentScope(scopedUserIds, agentIds);

  const replacements = { from: period.from, to: period.to, at: period.to };
  const { scopeClause, productClause } = buildScopeClauses(
    { ...scope, productIds, subsourceIds },
    replacements,
  );
  const cte = buildArrivalsCte({ scopeClause, productClause });

  const hasPrevious = !!previous;
  if (hasPrevious) {
    replacements.prevFrom = previous.from;
    replacements.prevTo = previous.to;
    replacements.prevAt = previous.to;
  }

  let currentRaw = EMPTY_WINDOW;
  let previousRaw = null;
  let distinctLeads = 0;

  if (!scope.isEmpty) {
    const [currentRows, previousRows, distinctRows] = await Promise.all([
      sequelize.query(
        windowQuery({
          cte,
          fromParam: 'from',
          toParam: 'to',
          atParam: 'at',
          live: readsLive(period.to, statusAsOf),
        }),
        { replacements, type: sequelize.QueryTypes.SELECT },
      ),
      hasPrevious
        ? sequelize.query(
            windowQuery({
              cte,
              fromParam: 'prevFrom',
              toParam: 'prevTo',
              atParam: 'prevAt',
              live: readsLive(previous.to, statusAsOf),
            }),
            { replacements, type: sequelize.QueryTypes.SELECT },
          )
        : Promise.resolve(null),
      // Queried, not summed from the rows: a lead that arrived twice in the
      // window appears in two rows and cannot be added up without
      // double-counting.
      sequelize.query(
        `
        ${cte}
        SELECT COUNT(DISTINCT ev.lead_id)::int AS distinct_leads
        FROM ev
        WHERE ev.event_time >= :from::timestamptz
          AND ev.event_time <= :to::timestamptz
        `,
        { replacements, type: sequelize.QueryTypes.SELECT },
      ),
    ]);

    currentRaw = rollup(currentRows);
    previousRaw = previousRows ? rollup(previousRows) : null;
    distinctLeads = distinctRows[0]?.distinct_leads || 0;
  }

  // ── Columns ────────────────────────────────────────────────────────────────
  // Active statuses always get a column, so the shape of the funnel is legible
  // even where a stage is empty. A DEACTIVATED status only gets one if it still
  // holds arrivals — dropping it would break the Total silently, which is worse
  // than one greyed column. Anything present in the data but missing from the
  // table (a status deleted since) is synthesised for the same reason.
  const present = new Set([
    ...Object.keys(currentRaw.totals.by_status),
    ...Object.keys(previousRaw?.totals.by_status || {}),
  ]);

  const defined = await Status.findAll({
    order: [
      ['sort_order', 'ASC'],
      ['label', 'ASC'],
    ],
  });

  const statuses = defined
    .filter((s) => !s.is_deactivated || present.has(s.id))
    .map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
      sort_order: s.sort_order,
      is_deactivated: s.is_deactivated,
    }));

  const known = new Set(defined.map((s) => s.id));
  for (const id of present) {
    if (!known.has(id)) {
      statuses.push({
        id,
        label: id,
        color: null,
        sort_order: 9999,
        is_deactivated: true,
      });
    }
  }

  const statusIds = statuses.map((s) => s.id);
  const current = zeroFill(currentRaw, statusIds);
  const previousWindow = previousRaw ? zeroFill(previousRaw, statusIds) : null;

  // ── KPIs ───────────────────────────────────────────────────────────────────
  // Deliberately NOT a conversion rate. Which status means "converted" is admin
  // configuration with no marker in the schema, and guessing wrong ships a KPI
  // that reads 0% forever. Untouched-vs-worked is the one split the server can
  // make honestly: see ARRIVAL_STATUS_IDS.
  const untouchedIn = (window) =>
    window
      ? ARRIVAL_STATUS_IDS.reduce(
          (sum, id) => sum + (window.totals.by_status[id] || 0),
          0,
        )
      : 0;

  const currentUntouched = untouchedIn(current);
  const previousUntouched = untouchedIn(previousWindow);
  const pct = (part, whole) =>
    whole ? Number(((part / whole) * 100).toFixed(1)) : 0;

  return {
    status_as_of: statusAsOf,
    statuses,
    current,
    previous: previousWindow,
    kpis: {
      total_arrivals: current.totals.total,
      total_previous_arrivals: previousWindow?.totals.total || 0,
      distinct_leads: distinctLeads,
      untouched: currentUntouched,
      previous_untouched: previousUntouched,
      untouched_pct: pct(currentUntouched, current.totals.total),
      previous_untouched_pct: pct(
        previousUntouched,
        previousWindow?.totals.total || 0,
      ),
      worked: current.totals.total - currentUntouched,
      previous_worked: (previousWindow?.totals.total || 0) - previousUntouched,
    },
  };
}

module.exports = { getLeadStatus };
