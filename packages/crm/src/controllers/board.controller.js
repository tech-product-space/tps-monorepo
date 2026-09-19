const leadAcquisitionService = require('../services/boards/leadAcquisition.service');
const leadStatusService = require('../services/boards/leadStatus.service');
const { HISTORY_STARTS_AT } = require('../services/boards/_arrivals');
const { resolvePeriod } = require('../utils/periodResolver');
const { getScopedUserIds } = require('../utils/dashboardScope');
const cache = require('../utils/dashboardCache');

/**
 * The filters every board takes, parsed identically so the two share a URL
 * shape and switching between them can carry the filters across.
 */
const csv = (value) =>
  value
    ? String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

function parseFilters(query) {
  return {
    // All three accept a comma-separated list. A single value still parses as a
    // one-element list, so older links keep working.
    productIds: csv(query.product_id),
    subsourceIds: csv(query.subsource_id),
    agentIds: csv(query.agent_id),
  };
}

/** Percentage change, or null when there is no base to compare against. */
function deltaPct(current, previous) {
  if (!previous) return null; // 0, null or undefined — "New", not infinity
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/**
 * Per-day and per-week rates, so periods of different lengths stay comparable.
 * The board leans on these in cohort mode, where an 8-week cohort and a 12-week
 * one cannot be judged on totals at all.
 *
 * Rates use ELAPSED days, not the period's nominal length: a week that is three
 * days old has produced three days of leads, and dividing those by seven would
 * understate the current run rate by more than half.
 */
function rates(total, elapsedDays) {
  const days = Math.max(elapsedDays || 0, 1 / 24); // never divide by zero
  const perDay = total / days;
  return {
    per_day: Number(perDay.toFixed(1)),
    per_week: Number((perDay * 7).toFixed(1)),
  };
}

/**
 * GET /api/v1/boards/lead-acquisition
 *
 * Query:
 *   period      today | yesterday | week | month | cohort | custom  (default: week)
 *   cohort_id   required when period=cohort
 *   from, to    required when period=custom (ISO instants)
 *   product_id  optional, comma-separated; narrows to those programmes
 *   subsource_id optional, comma-separated; narrows to those channels
 *   agent_id    optional, comma-separated; "unassigned" is accepted as a member
 *
 * Superadmin and Manager only (route). A Manager is scoped to their own team
 * plus unassigned inflow.
 */
const getLeadAcquisitionBoard = async (req, res) => {
  try {
    const { period, previous, cohort } = await resolvePeriod(req.query);

    const { productIds, subsourceIds, agentIds } = parseFilters(req.query);

    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'board:lead-acquisition',
      filters: {
        from: period.from,
        to: period.to,
        prev_from: previous?.from ?? null,
        prev_to: previous?.to ?? null,
        product_id: productIds,
        subsource_id: subsourceIds,
        agent_id: agentIds,
      },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await getScopedUserIds(req.user);
    const data = await leadAcquisitionService.getLeadAcquisition({
      scopedUserIds,
      period,
      previous,
      productIds,
      subsourceIds,
      agentIds,
    });

    const currentRates = rates(data.kpis.total_new_leads, period.elapsed_days);
    // The previous window is compared on the same elapsed basis it was built
    // with — for today/week that is the truncated slice, for a cohort its own
    // full length. Comparing a part-week against a whole one is the single
    // easiest way to make every channel look like it collapsed.
    const previousElapsed = previous
      ? (new Date(previous.to) - new Date(previous.from)) / (24 * 60 * 60 * 1000)
      : 0;
    const previousRates = previous
      ? rates(data.kpis.total_previous_leads, previousElapsed)
      : { per_day: 0, per_week: 0 };

    const payload = {
      period: {
        ...period,
        // Rounded here so every consumer describes the period identically.
        elapsed_days: Number((period.elapsed_days || 0).toFixed(2)),
      },
      previous: previous
        ? {
            ...previous,
            elapsed_days: Number(previousElapsed.toFixed(2)),
          }
        : null,
      cohort,
      kpis: {
        total_new_leads: {
          current: data.kpis.total_new_leads,
          previous: data.kpis.total_previous_leads,
          change_pct: deltaPct(
            data.kpis.total_new_leads,
            data.kpis.total_previous_leads,
          ),
        },
        avg_leads_per_week: {
          current: currentRates.per_week,
          previous: previousRates.per_week,
          change_pct: deltaPct(currentRates.per_week, previousRates.per_week),
        },
        leads_per_day: {
          current: currentRates.per_day,
          previous: previousRates.per_day,
          change_pct: deltaPct(currentRates.per_day, previousRates.per_day),
        },
        distinct_people: data.kpis.distinct_people,
        fresh: data.kpis.fresh,
        returning_leads: data.kpis.returning_leads,
      },
      rows: data.rows.map((row) => ({
        ...row,
        change_pct: deltaPct(row.new_leads, row.previous_leads),
        subsources: row.subsources.map((sub) => ({
          ...sub,
          change_pct: deltaPct(sub.new_leads, sub.previous_leads),
        })),
      })),
      by_day: data.by_day,
      // A window reaching before lead_history existed returns real zeros that
      // mean "not recorded", not "no leads". The board says so rather than
      // letting someone read an empty table as a bad month.
      history_starts_at: HISTORY_STARTS_AT,
      truncated_by_history:
        new Date(previous?.from ?? period.from) < HISTORY_STARTS_AT,
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Lead acquisition board error:', err);
    res.status(500).json({ error: 'Failed to load the lead acquisition board.' });
  }
};

/**
 * GET /api/v1/boards/lead-status
 *
 * The same arrivals as the acquisition board, cut by status instead of by
 * volume. Takes an identical query, and its `current.totals.total` equals that
 * board's `total_new_leads` for the same filters.
 *
 * Superadmin and Manager only (route).
 */
const getLeadStatusBoard = async (req, res) => {
  try {
    const { period, previous, cohort } = await resolvePeriod(req.query);
    const { productIds, subsourceIds, agentIds } = parseFilters(req.query);

    // Live by default, so the board agrees with the Leads page. The
    // point-in-time reading is still reachable, and is the only one that gives
    // an unbiased period-vs-period comparison — see the service's header.
    const statusAsOf =
      req.query.status_as_of === 'window_close' ? 'window_close' : 'now';

    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'board:lead-status',
      filters: {
        from: period.from,
        to: period.to,
        prev_from: previous?.from ?? null,
        prev_to: previous?.to ?? null,
        product_id: productIds,
        subsource_id: subsourceIds,
        agent_id: agentIds,
        // Two different answers over the same rows — they cannot share a slot.
        status_as_of: statusAsOf,
      },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await getScopedUserIds(req.user);
    const data = await leadStatusService.getLeadStatus({
      scopedUserIds,
      period,
      previous,
      productIds,
      subsourceIds,
      agentIds,
      statusAsOf,
    });

    const previousElapsed = previous
      ? (new Date(previous.to) - new Date(previous.from)) / (24 * 60 * 60 * 1000)
      : 0;

    const k = data.kpis;
    const payload = {
      period: {
        ...period,
        elapsed_days: Number((period.elapsed_days || 0).toFixed(2)),
      },
      previous: previous
        ? { ...previous, elapsed_days: Number(previousElapsed.toFixed(2)) }
        : null,
      cohort,
      status_as_of: data.status_as_of,
      statuses: data.statuses,
      kpis: {
        total_arrivals: {
          current: k.total_arrivals,
          previous: k.total_previous_arrivals,
          change_pct: deltaPct(k.total_arrivals, k.total_previous_arrivals),
        },
        untouched: {
          current: k.untouched,
          previous: k.previous_untouched,
          change_pct: deltaPct(k.untouched, k.previous_untouched),
        },
        // Reported as a share, because the count alone moves with the size of
        // the intake — a bigger week with the same neglect looks worse.
        untouched_pct: {
          current: k.untouched_pct,
          previous: k.previous_untouched_pct,
          change_pct: deltaPct(k.untouched_pct, k.previous_untouched_pct),
        },
        worked: {
          current: k.worked,
          previous: k.previous_worked,
          change_pct: deltaPct(k.worked, k.previous_worked),
        },
        distinct_leads: k.distinct_leads,
      },
      current: data.current,
      previous_window: data.previous,
      history_starts_at: HISTORY_STARTS_AT,
      truncated_by_history:
        new Date(previous?.from ?? period.from) < HISTORY_STARTS_AT,
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Lead status board error:', err);
    res.status(500).json({ error: 'Failed to load the lead status board.' });
  }
};

module.exports = { getLeadAcquisitionBoard, getLeadStatusBoard };
