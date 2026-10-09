/**
 * One-off: import historical website visits from TPS into the CRM.
 *
 * The live feed only started when CRM_WEBSITE_VISIT_ENABLED was switched on, so
 * everything before that moment exists in TPS and nowhere else. This reads TPS
 * directly over TPS_DATABASE_URL and runs each visit through the same ingest the
 * webhook uses — no HTTP, no signatures, no network hop per record.
 *
 * Safe to run, and safe to re-run:
 *
 *   - Every visit carries TPS's own record id, which is unique in website_visits.
 *     Anything the live feed already delivered is rejected and counted as a
 *     duplicate, so this cannot double anything up.
 *   - Visits are processed OLDEST FIRST, so where a lead does get created it ends
 *     up reflecting the newest visit rather than whichever was processed last.
 *   - They are marked as backfill, so a person who already has a Website Visitors
 *     lead gets the visit added to their history and nothing else — no status
 *     reset, no "re-entered" entry, nothing bumped to the top of anyone's list.
 *
 * Then the repair pass rewrites each lead's Source Created, Last Entry Date and
 * Page Viewed from the real visit times. Without it every imported lead would
 * claim it was visited today, because that is when the row was written.
 *
 *   node src/scripts/backfillWebsiteVisits.js --from=2026-08-01 --dry-run
 *   node src/scripts/backfillWebsiteVisits.js --from=2026-08-01
 *   node src/scripts/backfillWebsiteVisits.js --from=2026-08-01 --to=2026-08-15
 *   node src/scripts/backfillWebsiteVisits.js --repair-only
 *
 * ── ps-v3 setup (one local Postgres, one database, one schema per service) ──
 *
 * TPS and the CRM now live in the same `productspace` database, in the `tps`
 * and `crm` schemas. So:
 *
 *   - TPS_DATABASE_URL is optional. Unset, the CRM's own DATABASE_URL is used,
 *     which already points at the shared database.
 *   - The TPS table is always read schema-qualified (TPS_DB_SCHEMA, default
 *     `tps`), so it can never be confused with anything in `crm` or `public`.
 *   - SSL follows DB_SSL, like the CRM's own connection. The local Postgres has
 *     no SSL listener; DB_SSL=true restores the old RDS behaviour.
 */

// Always the crm-backend .env, whatever folder the script is started from —
// the same file src/config/database.js loads, so both connections agree.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Sequelize, QueryTypes } = require('sequelize');
const { sequelize, WebsiteVisit } = require('../models');
const websiteVisitService = require('../services/websiteVisit.service');

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = flag('dry-run');
const REPAIR_ONLY = flag('repair-only');
const SKIP_REPAIR = flag('skip-repair');
const BATCH = Number(arg('batch', 500));
// Each ingest is a transaction against a remote database. A small pause keeps a
// long import from behaving like a load test.
const DELAY_MS = Number(arg('delay', 25));

/** Plain dates mean IST, because that is what "August 1st" means to whoever asks. */
const parseDate = (value, endOfDay = false) => {
  if (!value) return null;
  if (value.includes('T')) return new Date(value);
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// Interpolated into SQL, so it must be a plain identifier — never anything else.
const TPS_SCHEMA = process.env.TPS_DB_SCHEMA || 'tps';
if (!/^[a-z_][a-z0-9_]*$/i.test(TPS_SCHEMA)) {
  throw new Error(`TPS_DB_SCHEMA "${TPS_SCHEMA}" is not a valid schema name.`);
}
const TPS_TABLE = `"${TPS_SCHEMA}"."VisitorNotificationHistory"`;

const tpsConnection = () => {
  const url = process.env.TPS_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Neither TPS_DATABASE_URL nor DATABASE_URL is set — cannot read the TPS database.');
  }

  // TPS_DB_SSL overrides for the odd case where TPS sits elsewhere; otherwise
  // the same switch the CRM's own connection uses.
  const sslFlag = process.env.TPS_DB_SSL ?? process.env.DB_SSL;
  const useSsl = sslFlag === 'true';

  return new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: {
      ...(useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {}),
      // Belt and braces: every query below is schema-qualified anyway.
      options: `-c search_path=${TPS_SCHEMA}`,
    },
    // Read-only, one query at a time. No reason to hold more connections on a
    // box the live API shares.
    pool: { max: 2, min: 0, idle: 10000 },
    logging: false,
  });
};

/**
 * Rewrites each Website Visitors lead from the visits actually recorded against
 * it: earliest visit becomes Source Created, latest becomes Last Entry Date, and
 * the latest visit's page becomes Page Viewed.
 *
 * Done in one statement rather than a loop — the database is remote and throttled,
 * so several thousand round trips would take far longer than the import itself.
 * Idempotent: the WHERE clause skips rows that already agree.
 *
 * Scoped to the import range: only leads with at least one visit inside
 * --from/--to are considered. Unscoped, it rewrote every Website Visitors lead
 * in the CRM whose dates differed by even a millisecond from its visits — over
 * 7,800 leads for a 5-day gap, nearly all of them untouched by the import.
 * --repair-only keeps the old, whole-table behaviour for when that is wanted.
 */
const REPAIR_SCOPE_SQL = `
    AND EXISTS (
      SELECT 1 FROM website_visits wv
       WHERE wv.lead_id = l.id
         AND wv.occurred_at >= :from
         AND wv.occurred_at <= :to
    )`;

const repairSql = (scoped) => `
  WITH agg AS (
    SELECT lead_id,
           MIN(occurred_at) AS first_seen,
           MAX(occurred_at) AS last_seen
    FROM website_visits
    WHERE lead_id IS NOT NULL
    GROUP BY lead_id
  ),
  latest AS (
    SELECT DISTINCT ON (lead_id) lead_id, page_url, page_label
    FROM website_visits
    WHERE lead_id IS NOT NULL
    ORDER BY lead_id, occurred_at DESC
  )
  SELECT l.id            AS lead_id,
         agg.first_seen,
         agg.last_seen,
         latest.page_url,
         latest.page_label
  FROM leads l
  JOIN agg    ON agg.lead_id = l.id
  JOIN latest ON latest.lead_id = l.id
  WHERE l.product_id = 'Website Visitors'
    AND (
      l.source_created_at IS DISTINCT FROM agg.first_seen
      OR l.lead_update_date IS DISTINCT FROM agg.last_seen
      OR COALESCE(l.additional_data->>'page_url', '') IS DISTINCT FROM COALESCE(latest.page_url, '')
    )
    ${scoped ? REPAIR_SCOPE_SQL : ''}
`;

/**
 * @param {{ dryRun: boolean, from?: Date, to?: Date }} opts  pass from+to to
 *   limit the repair to leads visited in that range; omit both for all leads.
 */
async function repair({ dryRun, from, to }) {
  const scoped = !!(from && to);
  const rows = await sequelize.query(repairSql(scoped), {
    replacements: scoped ? { from, to } : {},
    type: QueryTypes.SELECT,
  });

  console.log('');
  console.log(`  Leads needing their dates corrected: ${rows.length}`);

  if (!rows.length) return;

  if (dryRun) {
    console.log('  Sample of what would change:');
    rows.slice(0, 5).forEach((r) => {
      console.log(
        `    ${r.lead_id}  first=${new Date(r.first_seen).toISOString().slice(0, 10)}` +
          `  last=${new Date(r.last_seen).toISOString().slice(0, 10)}  page=${r.page_label || r.page_url}`,
      );
    });
    return;
  }

  let fixed = 0;
  for (const group of chunk(rows, 200)) {
    await sequelize.transaction(async (transaction) => {
      for (const r of group) {
        await sequelize.query(
          `UPDATE leads
              SET source_created_at = :first_seen,
                  lead_update_date  = :last_seen,
                  additional_data   = COALESCE(additional_data, '{}'::jsonb)
                                      || jsonb_build_object('page_url', :page_url, 'page_label', :page_label)
            WHERE id = :lead_id`,
          {
            replacements: {
              lead_id: r.lead_id,
              first_seen: r.first_seen,
              last_seen: r.last_seen,
              page_url: r.page_url,
              page_label: r.page_label,
            },
            transaction,
          },
        );
        fixed += 1;
      }
    });
    console.log(`    repaired ${fixed}/${rows.length}`);
  }
}

// Module-level so the exit handlers can always close it, success or failure.
let tps = null;

async function main() {
  if (REPAIR_ONLY) {
    console.log('\n  Repair pass only — no import.\n');
    await repair({ dryRun: DRY_RUN });
    return;
  }

  const from = parseDate(arg('from'));
  const to = parseDate(arg('to'), true) || new Date();

  if (!from) {
    console.error('Missing --from. Example: --from=2026-08-01');
    process.exit(1);
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    console.error('Could not read --from / --to. Use YYYY-MM-DD, e.g. --from=2026-10-05');
    process.exit(1);
  }

  if (from > to) {
    console.error(`--from (${from.toISOString()}) is after --to (${to.toISOString()}).`);
    process.exit(1);
  }

  tps = tpsConnection();

  const [{ db, found }] = await tps.query(
    `SELECT current_database() AS db,
            to_regclass(:table) IS NOT NULL AS found`,
    { replacements: { table: TPS_TABLE }, type: QueryTypes.SELECT },
  );

  // Fail loudly here rather than half-way through: a wrong schema or database
  // would otherwise surface as "relation does not exist" mid-import.
  if (!found) {
    throw new Error(
      `${TPS_TABLE} not found in database "${db}". ` +
        'Check TPS_DATABASE_URL / DATABASE_URL and TPS_DB_SCHEMA.',
    );
  }

  const stats = await tps.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(DISTINCT "visitorId")::int AS people,
            COUNT(*) FILTER (WHERE phone IS NOT NULL)::int AS with_phone
       FROM ${TPS_TABLE}
      WHERE timestamp >= :from AND timestamp <= :to`,
    { replacements: { from, to }, type: QueryTypes.SELECT },
  );
  const { total, people, with_phone: withPhone } = stats[0];

  // How many of these the CRM already holds, so the dry run reports the real
  // amount of work rather than the size of the range.
  const ids = await tps.query(
    `SELECT id FROM ${TPS_TABLE}
      WHERE timestamp >= :from AND timestamp <= :to`,
    { replacements: { from, to }, type: QueryTypes.SELECT },
  );
  let already = 0;
  for (const group of chunk(ids.map((r) => String(r.id)), 1000)) {
    already += await WebsiteVisit.count({ where: { source_event_id: group } });
  }

  console.log('');
  console.log(`  TPS database   : ${db}  (table ${TPS_TABLE})`);
  console.log(`  CRM database   : ${sequelize.config.database}`);
  console.log(`  Range          : ${from.toISOString()}  ->  ${to.toISOString()}`);
  console.log(`  Records        : ${total}`);
  console.log(`  People         : ${people}`);
  console.log(`  With a phone   : ${withPhone}   (only these can become leads)`);
  console.log(`  Already in CRM : ${already}   (will be skipped)`);
  console.log(`  To import      : ${total - already}`);
  console.log(`  Mode           : ${DRY_RUN ? 'DRY RUN — nothing will be written' : 'LIVE'}`);
  console.log('');

  if (!total) {
    console.log('  Nothing in range. Done.');
    return;
  }

  if (DRY_RUN) {
    const sample = await tps.query(
      `SELECT id, phone, page, timestamp FROM ${TPS_TABLE}
        WHERE timestamp >= :from AND timestamp <= :to
        ORDER BY timestamp ASC, id ASC LIMIT 5`,
      { replacements: { from, to }, type: QueryTypes.SELECT },
    );
    console.log('  Oldest 5 in range:');
    sample.forEach((r) => {
      console.log(
        `    ${new Date(r.timestamp).toISOString()}  ${String(r.phone || '(no phone)').padEnd(16)}  ${r.page || ''}`,
      );
    });

    await repair({ dryRun: true, from, to });

    console.log('');
    console.log('  Re-run without --dry-run to apply.');
    console.log('');
    return;
  }

  const counts = { created: 0, history_only: 0, duplicate: 0, unmatched: 0, failed: 0 };
  const failures = [];
  let done = 0;
  // Keyset paging on (timestamp, id) rather than OFFSET. Two visits with the same
  // timestamp have no fixed order under ORDER BY timestamp alone, so OFFSET could
  // skip one and repeat the other between pages. The id tiebreak makes the order
  // total, and the cursor makes each page a cheap index seek.
  let cursor = null;

  for (;;) {
    // Oldest first — see the header.
    const batch = await tps.query(
      `SELECT id, "visitorId", name, email, phone, page, timestamp
         FROM ${TPS_TABLE}
        WHERE timestamp >= :from AND timestamp <= :to
          ${cursor ? 'AND (timestamp, id) > (CAST(:cursorTs AS timestamptz), CAST(:cursorId AS integer))' : ''}
        ORDER BY timestamp ASC, id ASC
        LIMIT :limit`,
      {
        replacements: {
          from,
          to,
          limit: BATCH,
          ...(cursor ? { cursorTs: cursor.ts, cursorId: cursor.id } : {}),
        },
        type: QueryTypes.SELECT,
      },
    );

    if (!batch.length) break;

    for (const row of batch) {
      try {
        const result = await websiteVisitService.ingest({
          source_event_id: String(row.id),
          visitor_id: row.visitorId,
          name: row.name,
          email: row.email,
          phone: row.phone,
          page_url: row.page,
          occurred_at: row.timestamp,
          backfill: true,
        });
        const status = result?.status || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
      } catch (err) {
        counts.failed += 1;
        failures.push({ id: row.id, reason: err.message });
      }

      done += 1;
      if (done % 250 === 0 || done === total) {
        console.log(
          `  ${done}/${total}  created=${counts.created} history=${counts.history_only} dup=${counts.duplicate} unmatched=${counts.unmatched} failed=${counts.failed}`,
        );
      }

      if (DELAY_MS) await sleep(DELAY_MS);
    }

    const last = batch[batch.length - 1];
    cursor = { ts: last.timestamp, id: last.id };
  }

  console.log('');
  console.log('  ── Import done ──────────────────────────');
  console.log(`  created      ${counts.created}\tnew leads made`);
  console.log(`  history_only ${counts.history_only}\tadded to someone who already had a lead`);
  console.log(`  duplicate    ${counts.duplicate}\talready in the CRM, skipped`);
  console.log(`  unmatched    ${counts.unmatched}\tno phone, stored without a lead`);
  console.log(`  failed       ${counts.failed}`);

  if (failures.length) {
    console.log('');
    console.log('  Failures (re-running retries these):');
    failures.slice(0, 20).forEach((f) => console.log(`    ${f.id}: ${f.reason}`));
    if (failures.length > 20) console.log(`    …and ${failures.length - 20} more`);
  }

  if (!SKIP_REPAIR) {
    console.log('');
    console.log('  ── Repairing lead dates ─────────────────');
    await repair({ dryRun: false, from, to });
  }

  console.log('');
}

const closeAll = async () => {
  if (tps) await tps.close().catch(() => {});
  await sequelize.close().catch(() => {});
};

main()
  .then(async () => {
    await closeAll();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nBackfill failed:', err.message);
    console.error(err.stack);
    await closeAll();
    process.exit(1);
  });
