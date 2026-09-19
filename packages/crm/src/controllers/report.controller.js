const reportService = require('../services/report.service');
const meetingReportService = require('../services/meetingReport.service');
const { getScopedUserIds } = require('../utils/dashboardScope');
const cache = require('../utils/dashboardCache');
const { parseRange } = require('../utils/periodCompare');

/**
 * GET /api/v1/reports/status-report
 *
 * Leads that ENTERED a given status within ?from/?to (defaults last 7 days),
 * from the StatusChange activity log. Required: ?status_id. Optional:
 * ?product_id, ?agent_id (comma-separated). Manager/Superadmin only (route).
 */
const getStatusReport = async (req, res) => {
  try {
    const statusId = req.query.status_id;
    if (!statusId) {
      return res.status(400).json({ error: 'status_id is required.' });
    }

    const range = parseRange(req.query);
    const productId = req.query.product_id || null;
    const agentIds = req.query.agent_id
      ? String(req.query.agent_id).split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'status-report',
      filters: {
        status_id: statusId,
        product_id: productId,
        agent_id: agentIds,
        from: range.current.from,
        to: range.current.to,
      },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await getScopedUserIds(req.user);
    const data = await reportService.getStatusEntryReport({
      scopedUserIds,
      range: range.current,
      statusId,
      productId,
      agentIds,
    });

    const payload = { range: range.current, status_id: statusId, ...data };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Status report error:', err);
    res.status(500).json({ error: 'Failed to load status report.' });
  }
};

/**
 * GET /api/v1/reports/meetings
 *
 * Agent-wise booking and outcome activity within ?from/?to (defaults last 7
 * days). Optional: ?grain=day|week (default day), ?agent_id (comma-separated).
 * Manager/Superadmin only (route).
 *
 * `as_of` is part of the payload, not decoration: outcome numbers are counted
 * on the day each call was HELD, so a past day's figures keep moving as
 * mentors report in. An exported or shared copy is only interpretable if it
 * says when it was taken.
 */
const getMeetingsReport = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const grain = req.query.grain === 'week' ? 'week' : 'day';
    const agentIds = req.query.agent_id
      ? String(req.query.agent_id).split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'meetings-report',
      filters: {
        grain,
        agent_id: agentIds,
        from: range.current.from,
        to: range.current.to,
      },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await getScopedUserIds(req.user);
    const data = await meetingReportService.getMeetingActivityReport({
      scopedUserIds,
      range: range.current,
      grain,
      agentIds,
    });

    const payload = { range: range.current, as_of: new Date().toISOString(), ...data };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Meetings report error:', err);
    res.status(500).json({ error: 'Failed to load meetings report.' });
  }
};

/**
 * GET /api/v1/reports/meetings/calls
 *
 * The report's drill-down list, paginated. Same window and scope as
 * /reports/meetings; ?page, ?limit, and ?export=1 to lift the page ceiling for
 * a CSV. Separate from the report so paging costs one query rather than
 * recomputing every chart. Manager/Superadmin only (route).
 */
const getMeetingsReportCalls = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const forExport = req.query.export === '1';
    const agentIds = req.query.agent_id
      ? String(req.query.agent_id).split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'meetings-report-calls',
      filters: {
        agent_id: agentIds,
        from: range.current.from,
        to: range.current.to,
        page: req.query.page || 1,
        limit: req.query.limit || 25,
        export: forExport,
      },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await getScopedUserIds(req.user);
    const data = await meetingReportService.getMeetingCalls({
      scopedUserIds,
      range: range.current,
      agentIds,
      page: req.query.page,
      limit: req.query.limit,
      forExport,
    });

    const payload = { as_of: new Date().toISOString(), ...data };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Meetings report calls error:', err);
    res.status(500).json({ error: 'Failed to load the call list.' });
  }
};

/** Comma-separated ?agent_id=a,b,c → ['a','b','c']. Null when absent. */
const parseAgentIds = (raw) =>
  raw ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : null;

/** Only these two are real sources; anything else means "no source filter". */
const parseSource = (raw) => (raw === 'google' || raw === 'calcom' ? raw : null);

/**
 * GET /api/v1/reports/meetings/overview
 *
 * The meetings BOOKED within ?from/?to (defaults last 7 days), followed to
 * wherever they ended up — completed, upcoming or cancelled, and for the
 * completed ones what happened at them. Every figure is split by source.
 *
 * Optional: ?agent_id (comma-separated, accepts the literal `unassigned`),
 * ?source=google|calcom. Manager/Superadmin only (route).
 *
 * Unlike /reports/meetings this fixes one cohort on created_at and never
 * changes date basis, so booked = completed + upcoming + cancelled and
 * completed = attended + no_show + cancelled_late + awaiting, exactly.
 */
const getMeetingsOverview = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const agentIds = parseAgentIds(req.query.agent_id);
    const source = parseSource(req.query.source);

    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'meetings-overview',
      filters: {
        agent_id: agentIds,
        source,
        from: range.current.from,
        to: range.current.to,
      },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await getScopedUserIds(req.user);
    const data = await meetingReportService.getMeetingOverviewReport({
      scopedUserIds,
      range: range.current,
      agentIds,
      source,
    });

    // `as_of` matters here for the same reason it does on the activity report:
    // awaiting outcomes get logged, so the attendance rate moves and a shared
    // copy is only interpretable if it says when it was taken.
    const payload = { range: range.current, as_of: new Date().toISOString(), ...data };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Meetings overview error:', err);
    res.status(500).json({ error: 'Failed to load the meetings report.' });
  }
};

/**
 * GET /api/v1/reports/meetings/overview/calls
 *
 * The overview's drill-down, paginated. Same window and scope as the overview,
 * plus ?status=completed|upcoming|cancelled and
 * ?outcome=attended|no_show|cancelled_late|awaiting — which is what lets every
 * figure on the report be clickable. ?export=1 lifts the page ceiling for CSV.
 */
const getMeetingsOverviewCalls = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const agentIds = parseAgentIds(req.query.agent_id);
    const source = parseSource(req.query.source);
    const forExport = req.query.export === '1';

    const cacheKey = {
      role: req.user.role,
      user_id: req.user.id,
      endpoint: 'meetings-overview-calls',
      filters: {
        agent_id: agentIds,
        source,
        status: req.query.status || null,
        outcome: req.query.outcome || null,
        from: range.current.from,
        to: range.current.to,
        page: req.query.page || 1,
        limit: req.query.limit || 25,
        export: forExport,
      },
    };
    if (req.query.nocache !== '1') {
      const cached = cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const scopedUserIds = await getScopedUserIds(req.user);
    const data = await meetingReportService.getMeetingOverviewCalls({
      scopedUserIds,
      range: range.current,
      agentIds,
      source,
      status: req.query.status,
      outcome: req.query.outcome,
      page: req.query.page,
      limit: req.query.limit,
      forExport,
    });

    const payload = { as_of: new Date().toISOString(), ...data };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Meetings overview calls error:', err);
    res.status(500).json({ error: 'Failed to load the meetings list.' });
  }
};

module.exports = {
  getStatusReport,
  getMeetingsReport,
  getMeetingsReportCalls,
  getMeetingsOverview,
  getMeetingsOverviewCalls,
};
