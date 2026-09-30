const service = require('../services/dashboard.service');
const cache = require('../utils/dashboardCache');
const { parseRange, deltaPct } = require('../utils/periodCompare');
const { hasGlobalScope } = require('../config/constants/roles');

/**
 * GET /api/v1/dashboard/overview
 *
 * Returns a role-shaped KPI bundle for the caller's dashboard.
 * Accepts optional ?from=ISO&to=ISO; defaults to last 30 days.
 *
 * Response shape:
 *   {
 *     role: 'Agent'|'Manager'|'Superadmin',
 *     range: { from, to },
 *     kpis: [ { key, label, value, delta_pct, format } ]
 *   }
 */
const getOverview = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'overview',
      filters: { from: range.current.from, to: range.current.to },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await service.getScopedUserIds(req.user);

    // Run current + previous window queries in parallel.
    const [
      curLeads, prevLeads,
      curTotal, prevTotal,
      curRevenue, prevRevenue,
      curAvgFirst, prevAvgFirst,
      activeAgents, myOpen,
    ] = await Promise.all([
      // "New" = leads whose first arrival falls in the window.
      service.countLeads({ scopedUserIds, range: range.current }),
      service.countLeads({ scopedUserIds, range: range.previous }),
      // "Total" = leads whose last entry/re-entry falls in the window.
      service.countLeads({ scopedUserIds, range: range.current, dateField: 'lead_update_date' }),
      service.countLeads({ scopedUserIds, range: range.previous, dateField: 'lead_update_date' }),
      service.sumRevenue({ scopedUserIds, range: range.current }),
      service.sumRevenue({ scopedUserIds, range: range.previous }),
      service.avgTimeToFirstContact({ scopedUserIds, range: range.current }),
      service.avgTimeToFirstContact({ scopedUserIds, range: range.previous }),
      req.user.role === 'Agent'
        ? Promise.resolve(0)
        : service.countActiveAgents({ scopedUserIds, range: range.current }),
      req.user.role === 'Agent'
        ? service.countMyOpenLeads({ user_id: req.user.id })
        : Promise.resolve(0),
    ]);

    const conv = curLeads === 0 ? 0 : Number(((curRevenue.count / curLeads) * 100).toFixed(1));
    const prevConv = prevLeads === 0 ? 0 : Number(((prevRevenue.count / prevLeads) * 100).toFixed(1));

    const kpis = [
      {
        key: 'total_leads',
        label: req.user.role === 'Agent' ? 'My open leads' : 'Total leads',
        value: req.user.role === 'Agent' ? myOpen : curTotal,
        delta_pct: req.user.role === 'Agent' ? null : deltaPct(curTotal, prevTotal),
        format: 'number',
      },
      {
        key: 'new_leads',
        label: 'New in period',
        value: curLeads,
        delta_pct: deltaPct(curLeads, prevLeads),
        format: 'number',
      },
      {
        key: 'conversions',
        label: 'Conversions',
        value: curRevenue.count,
        delta_pct: deltaPct(curRevenue.count, prevRevenue.count),
        format: 'number',
      },
      {
        key: 'conv_pct',
        label: 'Conversion %',
        value: conv,
        delta_pct: deltaPct(conv, prevConv),
        format: 'percent',
      },
      {
        key: 'revenue',
        label: 'Revenue',
        value: curRevenue.total,
        delta_pct: deltaPct(curRevenue.total, prevRevenue.total),
        format: 'currency',
      },
      {
        key: req.user.role === 'Agent' ? 'avg_first_contact' : 'active_agents',
        label: req.user.role === 'Agent' ? 'Avg first contact (min)' : 'Active agents',
        value: req.user.role === 'Agent'
          ? (curAvgFirst === null ? null : Math.round(curAvgFirst))
          : activeAgents,
        delta_pct: req.user.role === 'Agent'
          ? deltaPct(curAvgFirst, prevAvgFirst)
          : null,
        format: req.user.role === 'Agent' ? 'duration_min' : 'number',
      },
    ];

    const payload = {
      role: req.user.role,
      range: range.current,
      kpis,
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Dashboard overview error:', err);
    res.status(500).json({ error: 'Failed to compute dashboard overview.' });
  }
};

/**
 * GET /api/v1/dashboard/queue
 * Priority-sorted today's queue for the caller's role scope.
 */
const getQueue = async (req, res) => {
  try {
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const queue = await service.getQueue({ scopedUserIds, limit });
    res.json({ queue });
  } catch (err) {
    console.error('Dashboard queue error:', err);
    res.status(500).json({ error: 'Failed to load queue.' });
  }
};

/**
 * GET /api/v1/dashboard/funnel
 * Lead counts per status, ordered by sort_order. Defaults to last 30 days.
 */
const getFunnel = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'funnel',
      filters: { from: range.current.from, to: range.current.to },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await service.getScopedUserIds(req.user);
    const stages = await service.getFunnel({ scopedUserIds, range: range.current });
    const payload = { stages, range: range.current };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Dashboard funnel error:', err);
    res.status(500).json({ error: 'Failed to load funnel.' });
  }
};

/**
 * GET /api/v1/dashboard/activity-feed?limit=20
 */
const getActivityFeed = async (req, res) => {
  try {
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const activities = await service.getActivityFeed({ scopedUserIds, limit });
    res.json({ activities });
  } catch (err) {
    console.error('Dashboard activity feed error:', err);
    res.status(500).json({ error: 'Failed to load activity feed.' });
  }
};

/**
 * GET /api/v1/dashboard/weekly-trend?days=14
 */
const getWeeklyTrend = async (req, res) => {
  try {
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const days = Math.min(Number(req.query.days) || 14, 90);
    const points = await service.getWeeklyTrend({ scopedUserIds, days });
    res.json({ points, days });
  } catch (err) {
    console.error('Dashboard weekly trend error:', err);
    res.status(500).json({ error: 'Failed to load weekly trend.' });
  }
};

/**
 * GET /api/v1/dashboard/leaderboard
 * Manager: ranks own team. Superadmin: ranks everyone.
 */
const getLeaderboard = async (req, res) => {
  try {
    if (req.user.role === 'Agent') {
      return res.status(403).json({ error: 'Forbidden for Agent role.' });
    }
    const range = parseRange(req.query);
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const [rows, totals] = await Promise.all([
      service.getLeaderboard({ scopedUserIds, range: range.current }),
      service.sumRevenue({ scopedUserIds, range: range.current }),
    ]);

    // Reconciliation row: surface conversions/revenue counted by the org KPI
    // but not attributable to any active Agent/Manager — i.e. unassigned
    // leads, leads owned by inactive users, or leads owned by Superadmins.
    const attributed = rows.reduce(
      (acc, r) => ({
        conversions: acc.conversions + Number(r.conversions),
        revenue: acc.revenue + Number(r.revenue),
      }),
      { conversions: 0, revenue: 0 },
    );
    const otherConversions = Math.max(0, totals.count - attributed.conversions);
    const otherRevenue = Math.max(0, totals.total - attributed.revenue);
    if (otherConversions > 0 || otherRevenue > 0) {
      rows.push({
        agent_id: '__other__',
        agent_name: 'Unassigned / Other',
        role: null,
        leads: 0,
        conversions: otherConversions,
        revenue: otherRevenue,
        conv_pct: 0,
        avg_first_contact_min: null,
        is_other: true,
      });
    }
    res.json({ rows, range: range.current });
  } catch (err) {
    console.error('Dashboard leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
};

/**
 * GET /api/v1/dashboard/workload
 * Agent × Status matrix of current open leads.
 */
const getWorkload = async (req, res) => {
  try {
    if (req.user.role === 'Agent') {
      return res.status(403).json({ error: 'Forbidden for Agent role.' });
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getWorkload({ scopedUserIds });
    res.json(data);
  } catch (err) {
    console.error('Dashboard workload error:', err);
    res.status(500).json({ error: 'Failed to load workload.' });
  }
};

/**
 * GET /api/v1/dashboard/followups/heatmap?days=14
 */
const getFollowupHeatmap = async (req, res) => {
  try {
    if (req.user.role === 'Agent') {
      return res.status(403).json({ error: 'Forbidden for Agent role.' });
    }
    const days = Math.min(Number(req.query.days) || 14, 60);
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getFollowupHeatmap({ scopedUserIds, days });
    res.json(data);
  } catch (err) {
    console.error('Dashboard heatmap error:', err);
    res.status(500).json({ error: 'Failed to load heatmap.' });
  }
};

/**
 * GET /api/v1/dashboard/unassigned?limit=20
 */
const getUnassignedLeads = async (req, res) => {
  try {
    if (req.user.role === 'Agent') {
      return res.status(403).json({ error: 'Forbidden for Agent role.' });
    }
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const leads = await service.getUnassignedLeads({ scopedUserIds, limit });
    res.json({ leads });
  } catch (err) {
    console.error('Dashboard unassigned error:', err);
    res.status(500).json({ error: 'Failed to load unassigned leads.' });
  }
};

/**
 * GET /api/v1/dashboard/timeseries?metric=&group_by=&split_by=
 */
const getTimeseries = async (req, res) => {
  try {
    const metric = ['leads', 'revenue', 'conversions'].includes(req.query.metric)
      ? req.query.metric
      : 'leads';
    const group_by = req.query.group_by === 'week' ? 'week' : 'day';
    const split_by = ['product', 'source'].includes(req.query.split_by)
      ? req.query.split_by
      : null;
    const range = parseRange(req.query);
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getTimeseries({
      scopedUserIds,
      range: range.current,
      metric,
      group_by,
      split_by,
    });
    res.json({ ...data, metric, group_by, split_by, range: range.current });
  } catch (err) {
    console.error('Dashboard timeseries error:', err);
    res.status(500).json({ error: 'Failed to load timeseries.' });
  }
};

/**
 * GET /api/v1/dashboard/product-matrix
 */
const getProductMatrix = async (req, res) => {
  try {
    // mode=all returns lifetime snapshot; default = period filtered by from/to.
    const mode = req.query.mode === 'all' ? 'all' : 'period';
    const range = parseRange(req.query);
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const rows = await service.getProductMatrix({
      scopedUserIds,
      range: mode === 'all' ? null : range.current,
    });
    res.json({ rows, range: mode === 'all' ? null : range.current, mode });
  } catch (err) {
    console.error('Dashboard product-matrix error:', err);
    res.status(500).json({ error: 'Failed to load product matrix.' });
  }
};

/**
 * GET /api/v1/dashboard/source-performance
 */
const getSourcePerformance = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const rows = await service.getSourcePerformance({ scopedUserIds, range: range.current });
    res.json({ rows, range: range.current });
  } catch (err) {
    console.error('Dashboard source-performance error:', err);
    res.status(500).json({ error: 'Failed to load source performance.' });
  }
};

/**
 * GET /api/v1/dashboard/manager-scorecard (org-wide roles only)
 */
const getManagerScorecard = async (req, res) => {
  try {
    if (!hasGlobalScope(req.user.role)) {
      return res.status(403).json({ error: 'Requires org-wide access.' });
    }
    const range = parseRange(req.query);
    const rows = await service.getManagerScorecard({ range: range.current });
    res.json({ rows, range: range.current });
  } catch (err) {
    console.error('Dashboard manager-scorecard error:', err);
    res.status(500).json({ error: 'Failed to load manager scorecard.' });
  }
};

/**
 * GET /api/v1/dashboard/manager/:id/view (org-wide roles only)
 * Returns the same payload shape as the Manager's own dashboard, scoped to
 * the requested manager + their subordinates.
 */
const getManagerView = async (req, res) => {
  try {
    if (!hasGlobalScope(req.user.role)) {
      return res.status(403).json({ error: 'Requires org-wide access.' });
    }
    const { id } = req.params;
    const scopedUserIds = await service.getScopedUserIds(req.user, { override_manager_id: id });
    const range = parseRange(req.query);

    const [leaderboard, workload, heatmap, funnel] = await Promise.all([
      service.getLeaderboard({ scopedUserIds, range: range.current }),
      service.getWorkload({ scopedUserIds }),
      service.getFollowupHeatmap({ scopedUserIds, days: 14 }),
      service.getFunnel({ scopedUserIds, range: range.current }),
    ]);

    res.json({
      manager_id: id,
      range: range.current,
      leaderboard,
      workload,
      heatmap,
      funnel,
    });
  } catch (err) {
    console.error('Dashboard manager-view error:', err);
    res.status(500).json({ error: 'Failed to load manager view.' });
  }
};

/**
 * GET /api/v1/dashboard/sla?threshold_minutes=1440
 */
const getSla = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const threshold_minutes = Math.min(
      Math.max(Number(req.query.threshold_minutes) || 1440, 1),
      60 * 24 * 30,
    );
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'sla',
      filters: { from: range.current.from, to: range.current.to, threshold_minutes },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getSlaStats({
      scopedUserIds, range: range.current, threshold_minutes,
    });
    const payload = { ...data, range: range.current };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Dashboard sla error:', err);
    res.status(500).json({ error: 'Failed to load SLA stats.' });
  }
};

/**
 * GET /api/v1/dashboard/sales-cycle
 */
const getSalesCycle = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'sales-cycle',
      filters: { from: range.current.from, to: range.current.to },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getSalesCycle({ scopedUserIds, range: range.current });
    const payload = { ...data, range: range.current };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Dashboard sales-cycle error:', err);
    res.status(500).json({ error: 'Failed to load sales cycle.' });
  }
};

/**
 * GET /api/v1/dashboard/time-in-stage
 * Lifetime aggregate (no period filter) — sparse stages need history.
 */
const getTimeInStage = async (req, res) => {
  try {
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'time-in-stage',
      filters: {},
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getTimeInStage({ scopedUserIds });
    cache.set(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Dashboard time-in-stage error:', err);
    res.status(500).json({ error: 'Failed to load time-in-stage.' });
  }
};

/**
 * GET /api/v1/dashboard/aging
 * Current open-lead snapshot — not period filtered.
 */
const getAging = async (req, res) => {
  try {
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'aging',
      filters: {},
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getAgingBuckets({ scopedUserIds });
    cache.set(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Dashboard aging error:', err);
    res.status(500).json({ error: 'Failed to load aging buckets.' });
  }
};

/**
 * GET /api/v1/dashboard/loss-reasons
 */
const getLossReasons = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'loss-reasons',
      filters: { from: range.current.from, to: range.current.to, limit },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getLossReasons({ scopedUserIds, range: range.current, limit });
    const payload = { ...data, range: range.current };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Dashboard loss-reasons error:', err);
    res.status(500).json({ error: 'Failed to load loss reasons.' });
  }
};

/**
 * GET /api/v1/dashboard/forecast
 */
const getForecast = async (req, res) => {
  try {
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'forecast',
      filters: {},
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getForecast({ scopedUserIds });
    cache.set(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Dashboard forecast error:', err);
    res.status(500).json({ error: 'Failed to load forecast.' });
  }
};

/**
 * GET /api/v1/dashboard/alerts
 */
const getAlerts = async (req, res) => {
  try {
    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'alerts',
      filters: {},
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const scopedUserIds = await service.getScopedUserIds(req.user);
    const data = await service.getAlerts({ scopedUserIds });
    cache.set(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Dashboard alerts error:', err);
    res.status(500).json({ error: 'Failed to load alerts.' });
  }
};

module.exports = {
  getOverview,
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
  getManagerView,
  getSla,
  getSalesCycle,
  getTimeInStage,
  getAging,
  getLossReasons,
  getForecast,
  getAlerts,
};
