const { localDateTrunc } = require('../dashboard.service');

/**
 * The arrival grain, shared by every board that counts inflow.
 *
 * This lives in one place on purpose. Two boards that each derive "how many
 * leads arrived" from their own SQL will eventually disagree, and the first
 * time a manager sees the Lead Status totals differ from the Lead Acquisition
 * totals, both boards stop being believed. Everything about *which rows count*
 * and *when they count* is decided here, once.
 *
 * ── Why lead_history and not leads ───────────────────────────────────────────
 * The grain is the ARRIVAL, not the lead row, and `leads` cannot express that.
 * A person returning on a product they already have UPDATES their existing row
 * rather than inserting one, so counting `leads` misses every re-entry; and that
 * same update overwrites `subsource_id`, so the live row also forgets whichever
 * channel originally delivered them. Counting from `leads` therefore both
 * under-counts and silently re-attributes — a report run twice on the same past
 * month can disagree with itself.
 *
 * `lead_history` has one immutable row per arrival, carrying the source as it
 * was at that moment. A closed period's answer never changes again.
 *
 * ── Which window an arrival falls in ─────────────────────────────────────────
 * Decided per row, because the two kinds of row date differently:
 *
 *   created     -> source_created_at. The real submission time at the source, so
 *                  a Friday-night Meta form the cron only collects on Saturday
 *                  still counts on Friday and agrees with Meta's own reporting.
 *
 *   re-entries  -> recorded_at. Their source_created_at is a snapshot copied off
 *                  the lead, and a re-entry never refreshes it, so it still
 *                  holds the person's ORIGINAL first-contact date. Filtering on
 *                  it would file an August return under June and lose it.
 *
 * ── Attribution ──────────────────────────────────────────────────────────────
 * Per-arrival: each arrival is credited to the subsource on its own row. Someone
 * who arrives via A and returns via B gives A one and B one — neither takes from
 * the other, and neither figure moves later. This is deliberately not first- or
 * last-touch; the question the boards answer is "what did each channel deliver".
 *
 * Consequence: counts are arrivals, never people. One person interested in three
 * products is three arrivals, which is right for judging channels but will not
 * reconcile against a headcount.
 *
 * ── One per source per day ───────────────────────────────────────────────────
 * A person filling the same form repeatedly is one lead for that channel that
 * day, however many times they submit. Arrivals are therefore collapsed to one
 * per (lead, subsource, local calendar day), keeping the earliest.
 *
 * This replaced a 5-minute gap rule, which counted a morning and an afternoon
 * submission as two. That was arguably truer to "interactions delivered", but
 * it made the board impossible to reconcile against the leads list, and a
 * number nobody can check is a number nobody uses. A day is a boundary anyone
 * can verify by eye.
 *
 * Consequences worth knowing:
 *   - A genuine second visit later the same day is not counted again. Accepted
 *     deliberately; the day is the unit.
 *   - The day is the LOCAL day (Asia/Kolkata), matching the period toggle and
 *     the daily trend, so a 00:30 IST arrival belongs to that IST day.
 *   - Two DIFFERENT subsources on the same day still count separately — each
 *     channel genuinely got an interaction, and merging them would take credit
 *     from one of them.
 *   - Spanning midnight counts twice, once per day. That is the same boundary
 *     every other figure on the board uses.
 *
 * Done on READ, not on write: ingestion keeps recording every submission, so
 * lead_history stays a complete raw log and this rule can be changed later
 * without having lost anything. It is also why the boards report fewer
 * arrivals than a raw `COUNT(*)` over lead_history.
 */

/** Earliest arrival any board can see — lead_history starts here. */
const HISTORY_STARTS_AT = new Date('2026-05-01T00:00:00+05:30');

/**
 * The two statuses an arrival is born into: `s_new` on a first contact,
 * `s_reentry` on a return. Both ids are written literally by lead.service.js,
 * so the application already depends on them existing — referencing them here
 * is no more fragile than the code that creates the leads.
 *
 * A lead still sitting in one of these at a window's close has arrived and not
 * yet been worked, which is the one funnel judgement that can be made without
 * an admin-configured mapping. Every other status is user-defined and carries
 * no meaning the server is entitled to assume.
 */
const ARRIVAL_STATUS_IDS = ['s_new', 's_reentry'];

/**
 * Intersect the caller's role scope with an explicit agent filter.
 *
 * Returns `{ agents, unassignedAllowed, isEmpty }`. `agents === null` means
 * unrestricted (a globally-scoped role with no filter). `isEmpty` is true when
 * the intersection selects nobody at all, which the caller should short-circuit
 * on rather than issue a query guaranteed to return nothing.
 */
function resolveAgentScope(scopedUserIds, agentIds) {
  let agents = scopedUserIds;
  let unassignedAllowed = true;

  if (agentIds && agentIds.length) {
    const explicit = agentIds.filter((id) => id !== 'unassigned');
    unassignedAllowed = agentIds.includes('unassigned');
    agents =
      scopedUserIds === null
        ? explicit
        : explicit.filter((id) => scopedUserIds.includes(id));
  }

  const isEmpty = agents !== null && agents.length === 0 && !unassignedAllowed;
  return { agents, unassignedAllowed, isEmpty };
}

/**
 * The WHERE fragments that scope the CTE, plus the replacements they need.
 *
 * Scope follows the lead's CURRENT owner — history has no owner of its own, so
 * a reassignment moves past arrivals with it. Unassigned inflow stays visible by
 * default, or a filtered view silently stops summing to the unfiltered one.
 *
 * Mutates `replacements` in place, the way the callers already build theirs.
 */
function buildScopeClauses(
  { agents, unassignedAllowed, productIds, subsourceIds },
  replacements,
) {
  let scopeClause = '';
  if (agents !== null) {
    if (agents.length && unassignedAllowed) {
      scopeClause = 'AND (l.agent_id IN (:agents) OR l.agent_id IS NULL)';
      replacements.agents = agents;
    } else if (agents.length) {
      scopeClause = 'AND l.agent_id IN (:agents)';
      replacements.agents = agents;
    } else {
      scopeClause = 'AND l.agent_id IS NULL';
    }
  }

  // Product and subsource are read off the HISTORY row, not the lead. The live
  // lead carries only its most recent channel, so filtering on `l.subsource_id`
  // would credit every past arrival to whichever channel happened to deliver
  // the person last — the exact re-attribution the arrival grain exists to stop.
  //
  // The two are ORed, not ANDed. They are one picker on screen: a whole product
  // and a single channel of another product are two things the reader asked to
  // SEE, so the answer is their union. Intersecting them would make any
  // cross-product selection return nothing at all — a filter that reads
  // perfectly sensibly and produces an empty board.
  const wanted = [];

  if (productIds && productIds.length) {
    wanted.push('h.product_id IN (:productIds)');
    replacements.productIds = productIds;
  }

  if (subsourceIds && subsourceIds.length) {
    wanted.push('h.subsource_id IN (:subsourceIds)');
    replacements.subsourceIds = subsourceIds;
  }

  const productClause = wanted.length
    ? `AND (${wanted.join(' OR ')})`
    : '';

  return { scopeClause, productClause };
}

/**
 * Arrival rows, scoped and windowed. `event_time` is the resolved date axis
 * described above.
 *
 * `lead_id` is carried through even though the acquisition board never groups on
 * it — the status board joins `leads` off it to resolve each arrival's status,
 * and a second CTE that differed by one column would defeat the whole point of
 * sharing this.
 */
function buildArrivalsCte({ scopeClause, productClause }) {
  return `
    WITH raw_ev AS (
      SELECT
        h.lead_id,
        h.profile_id,
        h.product_id,
        h.subsource_id,
        h.change_type,
        CASE WHEN h.change_type = 'created'
             THEN h.source_created_at
             ELSE h.recorded_at
        END AS event_time
      FROM lead_history h
      JOIN leads l ON l.id = h.lead_id AND l.is_deleted = false
      WHERE true
        ${scopeClause}
        ${productClause}
    ),
    ev AS (
      -- One row per lead + subsource + local day, keeping the earliest. The
      -- ORDER BY must open with the same expressions as DISTINCT ON; the
      -- trailing event_time is what picks the first arrival of that day rather
      -- than an arbitrary one.
      SELECT DISTINCT ON (
        lead_id,
        subsource_id,
        ${localDateTrunc('day', 'event_time')}
      )
        lead_id, profile_id, product_id, subsource_id, change_type, event_time
      FROM raw_ev
      ORDER BY
        lead_id,
        subsource_id,
        ${localDateTrunc('day', 'event_time')},
        event_time
    )
  `;
}

module.exports = {
  HISTORY_STARTS_AT,
  ARRIVAL_STATUS_IDS,
  resolveAgentScope,
  buildScopeClauses,
  buildArrivalsCte,
};
