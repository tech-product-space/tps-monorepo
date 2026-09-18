'use strict';
const { sequelize } = require('../models');
const { localDateTrunc } = require('./dashboard.service');
const { parsePagination, buildPage } = require('../utils/pagination');

const LOCAL_TZ = process.env.DASHBOARD_TIMEZONE || 'Asia/Kolkata';

/**
 * Agent-wise meeting activity over a window, at day or week grain.
 *
 * ATTRIBUTION — everything else follows from this. Outcome metrics count
 * against `end_time`, the day the call HAPPENED, never `outcome_at`, the day
 * someone got round to reporting it. A call held Monday and logged Tuesday is
 * a Monday call; counting it on Tuesday would make this a report on mentors'
 * typing habits rather than on calls.
 *
 * The consequence is that past buckets RESTATE as outcomes arrive — Monday's
 * attended count rises on Tuesday. That's correct, and the report stays honest
 * about it by carrying `awaiting` in every bucket: a bucket is only final once
 * awaiting hits 0. Never drop that column; a restating number with no unknown
 * count beside it just looks broken.
 *
 * `outcome_at` earns its keep in exactly one place: reporting lag
 * (logged_late / median_lag_hours), which is the honest question it can answer.
 *
 * `booked` counts on `created_at` instead, because it measures a different act
 * — putting the call in the diary. Booked and held sit on different date bases
 * deliberately and are NOT a funnel: a call booked Friday for next Tuesday
 * belongs to one bucket for booked and another for held.
 *
 * Grouping is by `organizer_id` — who booked and ran the call. Note this
 * differs from report.service/dashboard.service, which group by the lead's
 * current owner (l.agent_id). For "who booked how many calls", the organizer
 * is the right answer; for "whose pipeline is this lead in", it isn't.
 *
 * No outcome in this system is ever fabricated: a verdict exists only where a
 * human logged one. The backfills that would have settled pre-feature meetings
 * as 'attended' were deliberately dropped, so meetings from before the feature
 * shipped simply sit in `awaiting` until someone reports them or nobody ever
 * does. The outcome_by IS NOT NULL guard below is kept as a belt-and-braces
 * check — today nothing can write an outcome without an actor.
 *
 * SOURCES — Cal.com bookings are Meeting rows too (source 'calcom') and count
 * everywhere here EXCEPT `booked`, which is Google-only. See bookedWhere: booked
 * measures the agent diarising a call, and a Cal.com booking was diarised by the
 * lead. Everything else — held, attended, no_show, cancelled_late, cancelled,
 * attend_rate — includes Cal.com, which is the point: self-booked calls are the
 * likeliest to be no-shows and were previously invisible here.
 */

// A real verdict: a human logged it. Nothing else can produce one.
const REAL = 'm.outcome IS NOT NULL AND m.outcome_by IS NOT NULL';

/** YYYY-MM-DD for a Date, in the report timezone (matches localDateTrunc). */
function localYmd(date) {
  return date.toLocaleDateString('en-CA', { timeZone: LOCAL_TZ });
}

/**
 * Every bucket the window covers, so the chart draws a continuous axis instead
 * of silently collapsing days that happen to have no meetings. Week buckets are
 * pinned to Monday to match Postgres date_trunc('week', …).
 */
function bucketSeries(from, to, grain) {
  const start = new Date(`${localYmd(from)}T00:00:00Z`);
  const end = new Date(`${localYmd(to)}T00:00:00Z`);
  if (grain === 'week') {
    // getUTCDay: 0=Sun. Postgres weeks start Monday, so Sunday steps back 6.
    const dow = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  }
  const step = grain === 'week' ? 7 : 1;
  const out = [];
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + step)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Postgres `date` columns come back as 'YYYY-MM-DD' strings or Dates. */
function bucketKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function getMeetingActivityReport({ scopedUserIds, range, grain = 'day', agentIds }) {
  const unit = grain === 'week' ? 'week' : 'day';

  // Intersect the caller's role scope with an optional explicit agent filter.
  let agents = scopedUserIds;
  if (agentIds && agentIds.length) {
    agents = scopedUserIds === null
      ? agentIds
      : agentIds.filter((id) => scopedUserIds.includes(id.toLowerCase()));
  }

  const empty = {
    summary: {
      booked: 0, held: 0, attended: 0, no_show: 0, cancelled_late: 0,
      awaiting: 0, backfilled: 0, cancelled: 0, resolved: 0, attend_rate: null,
    },
    by_agent: [],
    by_period: bucketSeries(range.from, range.to, unit).map((bucket) => ({
      bucket, booked: 0, held: 0, resolved: 0, awaiting: 0,
      attended: 0, no_show: 0, cancelled_late: 0,
    })),
    rows: [],
    logging: { logged_in_period: 0, logged_late: 0, logged_late_pct: null, median_lag_hours: null },
  };
  if (agents !== null && agents.length === 0) return empty;

  const replacements = { from: range.from, to: range.to };
  let scopeClause = '';
  if (agents !== null) {
    scopeClause = 'AND m.organizer_id IN (:agents)';
    replacements.agents = agents;
  }

  // A meeting is "held" once it has actually ended — end_time inside the
  // window AND already past. Without the NOW() guard, a window ending in the
  // future would count tonight's calls as held and park them in `awaiting`.
  const heldWhere = `
    m.status = 'scheduled'
    AND m.end_time BETWEEN :from AND :to
    AND m.end_time <= NOW()
    ${scopeClause}
  `;
  // Google only, and deliberately. `booked` measures an act the agent performed
  // — putting the call in the diary. A Cal.com booking is the LEAD putting it
  // there via the self-serve link; crediting that to the agent whose lead it
  // happens to be would be measuring their inbound luck, not their work.
  //
  // Every other metric here does include Cal.com, because the agent really did
  // hold that call: held, attended, no_show and cancelled_late all count it, so
  // attend_rate finally reflects the channel where leads book themselves and are
  // likeliest not to turn up. `cancelled` counts it too — a lead cancelling on
  // you is your call being cancelled, whoever booked it.
  const bookedWhere = `
    m.created_at BETWEEN :from AND :to
    AND m.source = 'google'
    ${scopeClause}
  `;
  const cancelledWhere = `
    m.status = 'cancelled'
    AND m.end_time BETWEEN :from AND :to
    ${scopeClause}
  `;

  // Counted per bucket and per agent alike, so the two cuts can never disagree.
  const metrics = `
    COUNT(*) FILTER (WHERE ${heldWhere})::int AS held,
    COUNT(*) FILTER (WHERE ${heldWhere} AND m.outcome = 'attended' AND m.outcome_by IS NOT NULL)::int AS attended,
    COUNT(*) FILTER (WHERE ${heldWhere} AND m.outcome = 'no_show' AND m.outcome_by IS NOT NULL)::int AS no_show,
    COUNT(*) FILTER (WHERE ${heldWhere} AND m.outcome = 'cancelled_late' AND m.outcome_by IS NOT NULL)::int AS cancelled_late,
    COUNT(*) FILTER (WHERE ${heldWhere} AND m.outcome IS NULL)::int AS awaiting,
    COUNT(*) FILTER (WHERE ${heldWhere} AND m.outcome IS NOT NULL AND m.outcome_by IS NULL)::int AS backfilled,
    COUNT(*) FILTER (WHERE ${cancelledWhere})::int AS cancelled,
    COUNT(*) FILTER (WHERE ${bookedWhere})::int AS booked
  `;

  // Reporting lag — the one place outcome_at is the right column. "Late" means
  // the verdict landed on a later local day than the call, not merely hours
  // after it: a 6pm call logged at 9pm the same evening is not late.
  const lagMetrics = `
    COUNT(*) FILTER (WHERE ${heldWhere} AND ${REAL}
      AND ${localDateTrunc('day', 'm.outcome_at')}
        > ${localDateTrunc('day', 'm.end_time')})::int AS logged_late,
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (m.outcome_at - m.end_time)) / 3600.0
    ) FILTER (WHERE ${heldWhere} AND ${REAL}) AS median_lag_hours
  `;

  // One outer WHERE covering the union of the three date bases, so this scans
  // the window rather than the table.
  const scanWhere = `WHERE ((${heldWhere}) OR (${bookedWhere}) OR (${cancelledWhere}))`;

  const [summaryRows, byAgent, bookedByBucket, heldByBucket, loggingRows] =
    await Promise.all([
      sequelize.query(
        `SELECT ${metrics}, ${lagMetrics} FROM meetings m ${scanWhere}`,
        { replacements, type: sequelize.QueryTypes.SELECT },
      ),
      sequelize.query(
        `
        SELECT
          m.organizer_id AS agent_id,
          -- A Cal.com booking nobody has picked up has no organizer, so it
          -- groups under NULL. Name it rather than render a blank row: an
          -- unclaimed call still happened and still needs a verdict. Only
          -- Superadmins see this group — every scoped view filters on
          -- organizer_id IN (…), which NULL never matches.
          COALESCE(u.name, 'Unassigned') AS agent_name,
          ${metrics}, ${lagMetrics}
        FROM meetings m
        LEFT JOIN users u ON u.id = m.organizer_id
        ${scanWhere}
        GROUP BY m.organizer_id, u.name
        ORDER BY booked DESC, held DESC, u.name ASC
        `,
        { replacements, type: sequelize.QueryTypes.SELECT },
      ),
      // Booked and held bucket on different columns, so they can't share a
      // GROUP BY — a row would have to land in two buckets at once.
      sequelize.query(
        `
        SELECT ${localDateTrunc(unit, 'm.created_at')} AS bucket, COUNT(*)::int AS booked
        FROM meetings m
        WHERE ${bookedWhere}
        GROUP BY 1 ORDER BY 1 ASC
        `,
        { replacements, type: sequelize.QueryTypes.SELECT },
      ),
      sequelize.query(
        `
        SELECT
          ${localDateTrunc(unit, 'm.end_time')} AS bucket,
          COUNT(*)::int AS held,
          COUNT(*) FILTER (WHERE m.outcome = 'attended' AND m.outcome_by IS NOT NULL)::int AS attended,
          COUNT(*) FILTER (WHERE m.outcome = 'no_show' AND m.outcome_by IS NOT NULL)::int AS no_show,
          COUNT(*) FILTER (WHERE m.outcome = 'cancelled_late' AND m.outcome_by IS NOT NULL)::int AS cancelled_late,
          COUNT(*) FILTER (WHERE m.outcome IS NULL)::int AS awaiting
        FROM meetings m
        WHERE ${heldWhere}
        GROUP BY 1 ORDER BY 1 ASC
        `,
        { replacements, type: sequelize.QueryTypes.SELECT },
      ),
      // Keyed on outcome_at, NOT end_time: "what did mentors clear this week",
      // which legitimately includes backlog from earlier weeks. Kept apart from
      // the held-date grid above so the two never contaminate each other.
      sequelize.query(
        `
        SELECT COUNT(*)::int AS logged_in_period
        FROM meetings m
        WHERE m.outcome_at BETWEEN :from AND :to
          AND m.outcome_by IS NOT NULL
          ${scopeClause}
        `,
        { replacements, type: sequelize.QueryTypes.SELECT },
      ),
    ]);

  const s = summaryRows[0] || {};
  const resolved = (s.attended || 0) + (s.no_show || 0) + (s.cancelled_late || 0);

  const bookedMap = new Map(bookedByBucket.map((r) => [bucketKey(r.bucket), r]));
  const heldMap = new Map(heldByBucket.map((r) => [bucketKey(r.bucket), r]));
  const by_period = bucketSeries(range.from, range.to, unit).map((bucket) => {
    const b = bookedMap.get(bucket);
    const h = heldMap.get(bucket);
    const held = h ? h.held : 0;
    const awaiting = h ? h.awaiting : 0;
    return {
      bucket,
      booked: b ? b.booked : 0,
      held,
      // What the chart draws solid. `awaiting` is the hollow remainder — the
      // part of this bucket that hasn't happened to a human yet.
      resolved: held - awaiting,
      awaiting,
      attended: h ? h.attended : 0,
      no_show: h ? h.no_show : 0,
      cancelled_late: h ? h.cancelled_late : 0,
    };
  });

  return {
    grain: unit,
    summary: {
      booked: s.booked || 0,
      held: s.held || 0,
      attended: s.attended || 0,
      no_show: s.no_show || 0,
      cancelled_late: s.cancelled_late || 0,
      awaiting: s.awaiting || 0,
      backfilled: s.backfilled || 0,
      cancelled: s.cancelled || 0,
      resolved,
      // Divided by resolved, not held. With awaiting in the denominator every
      // rate would open the day artificially low and drift up as mentors catch
      // up — measuring reporting speed and calling it attendance. null (not 0)
      // when nothing has resolved: "no answer yet" isn't "0%".
      attend_rate: resolved ? Number(((s.attended / resolved) * 100).toFixed(1)) : null,
    },
    by_agent: byAgent.map((a) => {
      const r = (a.attended || 0) + (a.no_show || 0) + (a.cancelled_late || 0);
      return {
        agent_id: a.agent_id,
        agent_name: a.agent_name,
        booked: a.booked,
        held: a.held,
        attended: a.attended,
        no_show: a.no_show,
        cancelled_late: a.cancelled_late,
        awaiting: a.awaiting,
        backfilled: a.backfilled,
        cancelled: a.cancelled,
        resolved: r,
        attend_rate: r ? Number(((a.attended / r) * 100).toFixed(1)) : null,
        logged_late: a.logged_late,
        median_lag_hours: a.median_lag_hours === null ? null : Number(Number(a.median_lag_hours).toFixed(1)),
      };
    }),
    by_period,
    logging: {
      logged_in_period: loggingRows[0] ? loggingRows[0].logged_in_period : 0,
      logged_late: s.logged_late || 0,
      logged_late_pct: resolved ? Number(((s.logged_late / resolved) * 100).toFixed(1)) : null,
      median_lag_hours: s.median_lag_hours === null || s.median_lag_hours === undefined
        ? null
        : Number(Number(s.median_lag_hours).toFixed(1)),
    },
  };
}

/** UI page size ceiling. The table asks for 25; nothing needs 500 on screen. */
const CALLS_MAX_LIMIT = 200;
/** CSV ceiling. Higher than the UI's — an export is meant to be complete. */
const CALLS_MAX_EXPORT = 5000;

/**
 * The drill-down list, paginated, and its own endpoint rather than a field on
 * the report.
 *
 * Org-wide over a month this is thousands of rows. The old shape returned a
 * silent LIMIT 500 inside the report payload, which is the worst of both: it
 * renders 500 rows into the DOM, and a manager reading "57 calls" has no way to
 * know the list stopped. Splitting it means page flips cost one cheap query
 * instead of recomputing every chart, `total` is honest about what was matched,
 * and the export can reach past what the screen shows.
 *
 * Same heldWhere as the report — a call is in this list exactly when it counts
 * toward `held` above, so the two can never disagree.
 */
async function getMeetingCalls({ scopedUserIds, range, agentIds, page = 1, limit = 25, forExport = false }) {
  let agents = scopedUserIds;
  if (agentIds && agentIds.length) {
    agents = scopedUserIds === null
      ? agentIds
      : agentIds.filter((id) => scopedUserIds.includes(id.toLowerCase()));
  }
  const ceiling = forExport ? CALLS_MAX_EXPORT : CALLS_MAX_LIMIT;
  const { page: pageNum, limit: pageSize, offset } = parsePagination(
    { page, limit },
    { defaultLimit: 25, maxLimit: ceiling },
  );

  if (agents !== null && agents.length === 0) {
    return buildPage({ rows: [], count: 0, page: pageNum, limit: pageSize });
  }

  const replacements = { from: range.from, to: range.to, limit: pageSize, offset };
  let scopeClause = '';
  if (agents !== null) {
    scopeClause = 'AND m.organizer_id IN (:agents)';
    replacements.agents = agents;
  }

  const heldWhere = `
    m.status = 'scheduled'
    AND m.end_time BETWEEN :from AND :to
    AND m.end_time <= NOW()
    ${scopeClause}
  `;

  const fromJoin = `
    FROM meetings m
    JOIN leads l ON l.id = m.lead_id AND l.is_deleted = false
    JOIN lead_profiles p ON p.id = m.profile_id
    LEFT JOIN users u ON u.id = m.organizer_id
    LEFT JOIN users ob ON ob.id = m.outcome_by
    LEFT JOIN lead_notes n ON n.id = m.outcome_note_id
    WHERE ${heldWhere}
  `;

  const [rows, countRows] = await Promise.all([
    sequelize.query(
      `
      SELECT
        m.id,
        m.lead_id,
        l.profile_id,
        p.name AS lead_name,
        p.phone,
        p.country_code,
        l.product_id,
        m.source,
        COALESCE(u.name, 'Unassigned') AS agent_name,
        m.title,
        m.end_time,
        m.outcome,
        m.outcome_at,
        m.outcome_by,
        ob.name AS outcome_by_name,
        n.content AS remark,
        CASE WHEN m.outcome_at IS NOT NULL AND m.outcome_by IS NOT NULL
             THEN ROUND((EXTRACT(EPOCH FROM (m.outcome_at - m.end_time)) / 3600.0)::numeric, 1)
        END AS lag_hours
      ${fromJoin}
      ORDER BY m.end_time DESC
      LIMIT :limit OFFSET :offset
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    sequelize.query(`SELECT COUNT(*)::int AS total ${fromJoin}`, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    }),
  ]);

  return buildPage({
    rows,
    count: countRows[0] ? countRows[0].total : 0,
    page: pageNum,
    limit: pageSize,
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * OVERVIEW REPORT
 *
 * A different question from getMeetingActivityReport above, and the one the
 * report page now leads with: take the meetings BOOKED in this window and
 * follow those same meetings to wherever they ended up.
 *
 * The activity report counts `booked` on created_at and `held` on end_time, so
 * its two headline numbers describe different sets of meetings and can't be
 * nested — hence the banners it needs to explain itself. This one fixes the
 * cohort at created_at and never changes date basis again, so every figure on
 * the page is a subset of the one above it and the sums close:
 *
 *     booked = completed + upcoming + cancelled
 *     completed = attended + no_show + cancelled_late + awaiting
 *
 * Those two identities are the product. If either stops holding, the page is
 * lying, and no amount of caption text will rescue it.
 *
 * SOURCES — Cal.com bookings count in `booked` here, unlike in the activity
 * report where booked is deliberately Google-only. That exclusion measures
 * agent effort honestly but breaks this page: a lead-booked meeting would
 * appear in the outcomes without appearing in the total it's meant to be part
 * of. So everything counts, and source is carried as a split on every figure
 * instead — which turns out to be the most useful cut on the page, since
 * self-booked leads attend at roughly half the rate.
 * ══════════════════════════════════════════════════════════════════════════ */

/** The cohort: meetings created inside the window. The only date basis used. */
const COHORT_WHERE = 'm.created_at BETWEEN :from AND :to';

/**
 * Where a meeting stands right now. Exclusive and exhaustive over the cohort —
 * every row lands in exactly one, which is what makes booked = the sum of them.
 */
const STATUS_SQL = {
  completed: "m.status = 'scheduled' AND m.end_time <= NOW()",
  upcoming: "m.status = 'scheduled' AND m.end_time > NOW()",
  cancelled: "m.status = 'cancelled'",
};

/**
 * What happened at a completed meeting. Also exclusive and exhaustive.
 *
 * A verdict counts only where a human logged it. A row carrying an outcome with
 * no actor behind it is a pre-feature backfill — folded into `awaiting` rather
 * than given a bucket of its own, so the four outcomes sum to `completed`
 * exactly and nobody has to learn what "backfilled" meant.
 */
const OUTCOME_SQL = {
  attended: "m.outcome = 'attended' AND m.outcome_by IS NOT NULL",
  no_show: "m.outcome = 'no_show' AND m.outcome_by IS NOT NULL",
  cancelled_late: "m.outcome = 'cancelled_late' AND m.outcome_by IS NOT NULL",
  awaiting: '(m.outcome IS NULL OR m.outcome_by IS NULL)',
};

const OVERVIEW_METRICS = `
  COUNT(*)::int AS booked,
  COUNT(*) FILTER (WHERE ${STATUS_SQL.completed})::int AS completed,
  COUNT(*) FILTER (WHERE ${STATUS_SQL.upcoming})::int AS upcoming,
  COUNT(*) FILTER (WHERE ${STATUS_SQL.cancelled})::int AS cancelled,
  COUNT(*) FILTER (WHERE ${STATUS_SQL.completed} AND ${OUTCOME_SQL.attended})::int AS attended,
  COUNT(*) FILTER (WHERE ${STATUS_SQL.completed} AND ${OUTCOME_SQL.no_show})::int AS no_show,
  COUNT(*) FILTER (WHERE ${STATUS_SQL.completed} AND ${OUTCOME_SQL.cancelled_late})::int AS cancelled_late,
  COUNT(*) FILTER (WHERE ${STATUS_SQL.completed} AND ${OUTCOME_SQL.awaiting})::int AS awaiting
`;

const METRIC_KEYS = [
  'booked', 'completed', 'upcoming', 'cancelled',
  'attended', 'no_show', 'cancelled_late', 'awaiting',
];

/**
 * Normalise a raw metric row and derive the rate.
 *
 * `attendance_rate` is attended ÷ COMPLETED — every meeting whose slot has
 * passed, whether or not anyone recorded a verdict on it. It used to divide by
 * `logged` instead; `logged` is still carried for callers that want the
 * resolved subset, but it is no longer the denominator.
 *
 * The trade-off, worth knowing when reading a low number: `awaiting` now sits
 * in the denominator, so a period opens low and climbs as people catch up on
 * their logging. The compensation is that the denominator is fixed the moment a
 * meeting's slot passes, so logging can only ever move the rate UP — it's a
 * floor rather than a figure that wobbles in both directions. While `awaiting`
 * is large, read it as "at least this much".
 *
 * null (not 0) when nothing has completed yet: "no meetings" isn't "0%".
 */
function shapeMetrics(row = {}) {
  const out = {};
  for (const key of METRIC_KEYS) out[key] = row[key] || 0;
  out.logged = out.attended + out.no_show + out.cancelled_late;
  out.attendance_rate = out.completed
    ? Number(((out.attended / out.completed) * 100).toFixed(1))
    : null;
  return out;
}

function sumMetrics(rows) {
  const acc = {};
  for (const row of rows) {
    for (const key of METRIC_KEYS) acc[key] = (acc[key] || 0) + (row[key] || 0);
  }
  return shapeMetrics(acc);
}

function splitBySource(rows) {
  return {
    google: shapeMetrics(rows.find((r) => r.source === 'google')),
    calcom: shapeMetrics(rows.find((r) => r.source === 'calcom')),
  };
}

/**
 * Intersect the caller's role scope with an optional explicit organiser filter,
 * and decide whether unassigned meetings come along.
 *
 * Unassigned meetings are Cal.com bookings nobody has picked up — they have no
 * organizer_id at all, so `organizer_id IN (…)` is false for them and a scoped
 * caller can never match one. That's correct rather than incidental: they
 * belong to no team, so only an unrestricted caller sees that group.
 *
 * Returns `empty: true` when the intersection is nobody, which the caller must
 * short-circuit on — an empty `IN ()` list is a SQL error, not an empty result.
 */
function buildOrganiserScope(scopedUserIds, agentIds) {
  const requested = (agentIds || []).filter(Boolean);
  const wantsUnassigned = requested.includes('unassigned');
  const explicit = requested.filter((id) => id !== 'unassigned');
  const unrestricted = scopedUserIds === null;

  // null means "no id restriction at all"
  let agents = null;
  if (explicit.length) {
    agents = unrestricted
      ? explicit
      : explicit.filter((id) => scopedUserIds.includes(id.toLowerCase()));
  } else if (wantsUnassigned) {
    agents = []; // asked for unassigned and nobody else
  } else if (!unrestricted) {
    agents = scopedUserIds;
  }

  if (agents === null) return { clause: '', replacements: {}, empty: false };

  const includeNull = unrestricted && wantsUnassigned;
  if (!agents.length && !includeNull) {
    return { clause: '', replacements: {}, empty: true };
  }

  const parts = [];
  if (agents.length) parts.push('m.organizer_id IN (:agents)');
  if (includeNull) parts.push('m.organizer_id IS NULL');
  return {
    clause: ` AND (${parts.join(' OR ')})`,
    replacements: agents.length ? { agents } : {},
    empty: false,
  };
}

/** Shared WHERE for the overview and its drill-down, so the two can't disagree. */
function buildOverviewWhere({ scopedUserIds, range, agentIds, source }) {
  const scope = buildOrganiserScope(scopedUserIds, agentIds);
  if (scope.empty) return { empty: true };

  const replacements = { from: range.from, to: range.to, ...scope.replacements };
  let sourceClause = '';
  if (source === 'google' || source === 'calcom') {
    sourceClause = ' AND m.source = :source';
    replacements.source = source;
  }
  return {
    empty: false,
    where: `WHERE ${COHORT_WHERE}${scope.clause}${sourceClause}`,
    replacements,
  };
}

function emptyOverview() {
  const zero = shapeMetrics();
  return {
    totals: zero,
    by_source: { google: zero, calcom: zero },
    by_organiser: [],
    awaiting_oldest: null,
  };
}

async function getMeetingOverviewReport({ scopedUserIds, range, agentIds, source }) {
  const built = buildOverviewWhere({ scopedUserIds, range, agentIds, source });
  if (built.empty) return emptyOverview();
  const { where, replacements } = built;

  const [sourceRows, organiserRows, oldestRows] = await Promise.all([
    sequelize.query(
      `SELECT m.source, ${OVERVIEW_METRICS} FROM meetings m ${where} GROUP BY m.source`,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    // Grouped by source as well as organiser, then nested in JS. One pass gives
    // both the per-person totals and their split, and guarantees the split adds
    // up to the total because it's the same aggregation.
    sequelize.query(
      `
      SELECT
        m.organizer_id AS organiser_id,
        -- An unclaimed Cal.com booking has no organiser, so it groups under
        -- NULL. Name it rather than render a blank row: the meeting still
        -- happened and still needs a verdict.
        COALESCE(u.name, 'Unassigned') AS organiser_name,
        m.source,
        ${OVERVIEW_METRICS}
      FROM meetings m
      LEFT JOIN users u ON u.id = m.organizer_id
      ${where}
      GROUP BY m.organizer_id, u.name, m.source
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    // Drives the "oldest has been open N days" line. One row, so the banner can
    // name a person instead of just a count.
    sequelize.query(
      `
      SELECT m.end_time, COALESCE(u.name, 'Unassigned') AS organiser_name
      FROM meetings m
      LEFT JOIN users u ON u.id = m.organizer_id
      ${where} AND ${STATUS_SQL.completed} AND ${OUTCOME_SQL.awaiting}
      ORDER BY m.end_time ASC
      LIMIT 1
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
  ]);

  const grouped = new Map();
  for (const row of organiserRows) {
    const key = row.organiser_id || 'unassigned';
    if (!grouped.has(key)) {
      grouped.set(key, {
        organiser_id: row.organiser_id,
        organiser_name: row.organiser_name,
        rows: [],
      });
    }
    grouped.get(key).rows.push(row);
  }

  const by_organiser = [...grouped.values()]
    .map((g) => ({
      organiser_id: g.organiser_id,
      organiser_name: g.organiser_name,
      totals: sumMetrics(g.rows),
      by_source: splitBySource(g.rows),
    }))
    .sort(
      (a, b) =>
        b.totals.booked - a.totals.booked ||
        b.totals.completed - a.totals.completed ||
        a.organiser_name.localeCompare(b.organiser_name),
    );

  const oldest = oldestRows[0];
  return {
    totals: sumMetrics(sourceRows),
    by_source: splitBySource(sourceRows),
    by_organiser,
    awaiting_oldest: oldest
      ? { end_time: oldest.end_time, organiser_name: oldest.organiser_name }
      : null,
  };
}

/** UI page size ceiling for the overview drill-down. */
const OVERVIEW_MAX_LIMIT = 200;
/** CSV ceiling. Higher than the UI's — an export is meant to be complete. */
const OVERVIEW_MAX_EXPORT = 5000;

/**
 * The overview's drill-down, and the reason every figure on the page can be
 * clickable: it accepts the same status / outcome / source / organiser filters
 * the cards are built from, so "show me those 22" is one request rather than a
 * table per number.
 */
async function getMeetingOverviewCalls({
  scopedUserIds, range, agentIds, source, status, outcome,
  page = 1, limit = 25, forExport = false,
}) {
  const ceiling = forExport ? OVERVIEW_MAX_EXPORT : OVERVIEW_MAX_LIMIT;
  const { page: pageNum, limit: pageSize, offset } = parsePagination(
    { page, limit },
    { defaultLimit: 25, maxLimit: ceiling },
  );

  const built = buildOverviewWhere({ scopedUserIds, range, agentIds, source });
  if (built.empty) {
    return buildPage({ rows: [], count: 0, page: pageNum, limit: pageSize });
  }

  let where = built.where;
  // An outcome filter only means anything for a meeting that has happened, so
  // it forces the completed bucket regardless of what `status` says.
  if (OUTCOME_SQL[outcome]) {
    where += ` AND ${STATUS_SQL.completed} AND ${OUTCOME_SQL[outcome]}`;
  } else if (STATUS_SQL[status]) {
    where += ` AND ${STATUS_SQL[status]}`;
  }

  const replacements = { ...built.replacements, limit: pageSize, offset };

  const fromJoin = `
    FROM meetings m
    JOIN leads l ON l.id = m.lead_id AND l.is_deleted = false
    JOIN lead_profiles p ON p.id = m.profile_id
    LEFT JOIN users u ON u.id = m.organizer_id
    LEFT JOIN users ob ON ob.id = m.outcome_by
    LEFT JOIN lead_notes n ON n.id = m.outcome_note_id
    ${where}
  `;

  const [rows, countRows] = await Promise.all([
    sequelize.query(
      `
      SELECT
        m.id,
        m.lead_id,
        l.profile_id,
        p.name AS lead_name,
        p.phone,
        p.country_code,
        l.product_id,
        m.source,
        COALESCE(u.name, 'Unassigned') AS organiser_name,
        m.organizer_id AS organiser_id,
        m.title,
        m.start_time,
        m.end_time,
        -- Frozen guest snapshot taken when the meeting was booked. The
        -- organiser is never in it (getAttendeeCandidates always excludes
        -- self), so the client only has to drop the lead to be left with the
        -- other guests. Sent whole rather than filtered in SQL: it's a handful
        -- of entries, and JSONB filtering here would cost more than it saves.
        m.attendees,
        -- One field for the badge rather than three the client has to combine.
        -- Mirrors the bucket definitions above exactly, in the same order.
        CASE
          WHEN m.status = 'cancelled' THEN 'cancelled'
          WHEN m.end_time > NOW() THEN 'upcoming'
          WHEN m.outcome IS NULL OR m.outcome_by IS NULL THEN 'awaiting'
          ELSE m.outcome
        END AS state,
        ob.name AS outcome_by_name,
        m.outcome_at,
        n.content AS remark,
        -- How long an unlogged meeting has been sitting. Null for anything that
        -- isn't waiting, so the client never has to guess whether it applies.
        CASE
          WHEN m.status = 'scheduled' AND m.end_time <= NOW()
               AND (m.outcome IS NULL OR m.outcome_by IS NULL)
          THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - m.end_time)) / 86400.0)::int
        END AS open_days
      ${fromJoin}
      ORDER BY m.start_time DESC
      LIMIT :limit OFFSET :offset
      `,
      { replacements, type: sequelize.QueryTypes.SELECT },
    ),
    sequelize.query(`SELECT COUNT(*)::int AS total ${fromJoin}`, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    }),
  ]);

  return buildPage({
    rows,
    count: countRows[0] ? countRows[0].total : 0,
    page: pageNum,
    limit: pageSize,
  });
}

module.exports = {
  getMeetingActivityReport,
  getMeetingCalls,
  getMeetingOverviewReport,
  getMeetingOverviewCalls,
};
