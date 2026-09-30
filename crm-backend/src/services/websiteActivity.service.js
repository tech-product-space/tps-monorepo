const { WebsiteActivity } = require('../models');
const leadService = require('./lead.service');
const { describePage } = require('../utils/websitePage');

/**
 * Takes a batch of page views from TPS and writes them. That is the whole job.
 *
 * What this deliberately does NOT do:
 *
 *   - look up the person
 *   - look up or create a lead
 *   - change a status, an owner, or any date
 *   - write an activity or history row
 *
 * All of that lives in websiteVisit.service.js, on the alerting path, and stays
 * there. This path exists to be fast enough that recording every page view is
 * affordable: one INSERT per batch, no queries in between. At a few hundred rows
 * a batch that is a handful of statements a second no matter how much traffic
 * the site takes.
 *
 * Resolving people at read time instead is what buys that — see the migration.
 */

// A batch bigger than this is a bug or an attack, not a busy afternoon. TPS
// drains in blocks of ~500.
const MAX_BATCH = 1000;

// TPS mints these with crypto.randomUUID(), so anything else is a bug upstream
// or a corrupted payload. Checked here rather than left to Postgres because a
// malformed id makes the INSERT throw, which fails the whole batch — and the
// sender is a queue worker, so it would retry that batch until it gave up,
// blocked behind one row that can never be written. Treating it as skipped lets
// the other 499 through.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same shape TPS sends; everything optional except id, visitor_id and page. */
const prepare = (row) => {
  if (!row || !row.id || !row.visitor_id || !row.page_url) return null;
  if (!UUID_RE.test(String(row.id))) return null;

  const page = describePage(row.page_url);

  // TPS's clock, never ours. A batch can arrive seconds or hours late and the
  // trail still has to read in the order things actually happened.
  const at = row.occurred_at ? new Date(row.occurred_at) : new Date();

  return {
    id: String(row.id),
    visitor_id: String(row.visitor_id),
    // Digits only, matching every other phone in this CRM — this is the join key.
    phone: leadService.normalizePhone(row.phone) || null,
    name: row.name || null,
    email: row.email || null,
    page_url: page.path,
    page_label: page.label,
    section: page.section,
    type: row.type || 'page_view',
    occurred_at: Number.isNaN(at.getTime()) ? new Date() : at,
    meta: row.meta || null,
  };
};

/**
 * @param {Array<object>} rows
 * @returns {{ received: number, accepted: number, skipped: number, duplicates: number }}
 *
 * Anything already stored collides on the primary key and is discarded inside
 * the same statement, so a re-sent batch is free rather than merely harmless —
 * which is what lets the worker retry without thinking about it.
 */
const ingestBatch = async (rows) => {
  if (!Array.isArray(rows)) throw new Error('Expected an array of activity rows');
  if (rows.length > MAX_BATCH) {
    throw new Error(`Batch too large: ${rows.length} (max ${MAX_BATCH})`);
  }

  const prepared = rows.map(prepare).filter(Boolean);
  const skipped = rows.length - prepared.length;

  if (!prepared.length) {
    return { received: rows.length, accepted: 0, skipped, duplicates: 0 };
  }

  // A batch can carry the same id twice if TPS retried mid-drain. Postgres
  // refuses a statement that touches the same row twice even with
  // ON CONFLICT DO NOTHING, so collapse them here first.
  const unique = [...new Map(prepared.map((r) => [r.id, r])).values()];

  // bulkCreate hands back the instances it built, not the rows the database
  // actually wrote, so it cannot tell us how many were new. One indexed count
  // on the primary key can. Advisory only: a concurrent batch carrying the same
  // ids could land between this and the insert. That would skew the number in a
  // log line, never the data — the ON CONFLICT below is what guarantees
  // correctness, not this.
  const duplicates = await WebsiteActivity.count({
    where: { id: unique.map((r) => r.id) },
  });

  await WebsiteActivity.bulkCreate(unique, {
    // ON CONFLICT DO NOTHING. The duplicate guard, done by the database.
    ignoreDuplicates: true,
  });

  return {
    received: rows.length,
    accepted: unique.length - duplicates,
    skipped,
    duplicates,
  };
};

module.exports = { ingestBatch, MAX_BATCH };
