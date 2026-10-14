/**
 * Import TPS free-course enrollments as Resources, oldest first.
 * Run from crm-backend (the .env path is independent of the working directory):
 *   node src/scripts/backfillFreeCourseLeads.js --dry-run
 *   node src/scripts/backfillFreeCourseLeads.js
 *   node src/scripts/backfillFreeCourseLeads.js --from=2026-08-01 --to=2026-10-14 --dry-run
 * Optional: --batch=500 --delay=25. Plain dates use IST. No --from means all history.
 *
 * Uses TPS_DATABASE_URL or DATABASE_URL, TPS_DB_SCHEMA (default tps), and
 * TPS_DB_SSL or DB_SSL, like backfillWebsiteVisits.js. TPS is read-only.
 * Dry run performs SELECTs only; no profile, lead, or history writes.
 * Enrollment IDs in leads/history make reruns skip both imported and live leads.
 * Each import is atomic. Existing statuses/owners and newer resource details are
 * preserved. Source Created is the earliest event; Last Entry is the latest.
 * Each history entry and resourceCreatedAt retain the actual enrollment date.
 * No separate repair pass is needed because dates are written correctly upfront.
 */
const { extractPhoneDetails } = require('../utils/helper/phone');

function options(argv) {
  const arg = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const date = (value, end = false) => new Date(value.includes('T') ? value : `${value}T${end ? '23:59:59.999' : '00:00:00.000'}+05:30`);
  const opts = {
    dryRun: argv.includes('--dry-run'),
    from: date(arg('from', '1970-01-01')),
    to: arg('to') ? date(arg('to'), true) : new Date(),
    batch: Number(arg('batch', 500)),
    delay: Number(arg('delay', 25)),
  };
  if (!Number.isFinite(opts.from.getTime()) || !Number.isFinite(opts.to.getTime()) || opts.from > opts.to) throw new Error('Invalid --from/--to date range. Use YYYY-MM-DD or an ISO timestamp.');
  if (!Number.isInteger(opts.batch) || opts.batch < 1) throw new Error('--batch must be a positive integer.');
  if (!Number.isFinite(opts.delay) || opts.delay < 0) throw new Error('--delay must be non-negative.');
  return opts;
}

function mapEnrollment(row) {
  const details = typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data || {};
  const { phoneNumber, countryCode } = extractPhoneDetails(String(row.phone || ''));
  const occurredAt = new Date(row.created_at);
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('Invalid enrollment date');
  if (!row.course_title) throw new Error('Enrollment has no course title');
  const fields = {
    product_id: 'Resources',
    source_created_at: occurredAt,
    extra_fields: {
      resourceName: row.course_title,
      resourceJobTitle: details.professionalRole || details.profession || '',
      resourceCreatedAt: occurredAt.toISOString(),
    },
    additional_data: {
      ...details,
      course_id: row.course_id,
      enrollment_id: String(row.id),
      visitor_id: details.visitorId || null,
      backfill: true,
    },
  };
  for (const key of ['utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) fields[key] = details[key] ?? '';
  return {
    name: row.name || row.user_name || 'Anonymous',
    email: details.email || row.user_email || '',
    phone: (phoneNumber || '').replace(/\D/g, ''),
    country_code: countryCode ? `+${countryCode}` : details.country_code || '+91',
    fields,
  };
}

async function isImported(models, id, transaction) {
  const where = { product_id: 'Resources', 'additional_data.enrollment_id': String(id) };
  return !!(await models.LeadHistory.findOne({ where, transaction }) || await models.Lead.findOne({ where, transaction }));
}

async function importEnrollment(models, payload, product, dryRun) {
  const { sequelize, Lead, LeadProfile, LeadHistory } = models;
  const { fields, ...contact } = payload;
  const id = fields.additional_data.enrollment_id;
  async function processRow(transaction) {
    if (transaction) {
      // Serializes parallel runs of this script for the same person.
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `free-course-backfill:${contact.phone}` }, transaction,
      });
    }
    if (await isImported(models, id, transaction)) return 'duplicate';
    if (!contact.phone) return 'unmatched';
    let profile = await LeadProfile.findOne({ where: { phone: contact.phone }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
    let lead = profile ? await Lead.findOne({
      where: { profile_id: profile.id, product_id: 'Resources', is_deleted: false },
      order: [['lead_update_date', 'DESC']], transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    }) : null;
    if (dryRun) return lead ? 'history_only' : 'created';

    const unique = (values, value) => [...new Set([...(values || []), value].filter(Boolean))];
    if (!profile) {
      profile = await LeadProfile.create({ ...contact, intent: product.intent_tier || 'Low', name_history: [contact.name], email_history: contact.email ? [contact.email] : [], interested_products: ['Resources'] }, { transaction });
    } else {
      await profile.update({
        name_history: unique(profile.name_history, contact.name),
        email_history: unique(profile.email_history, contact.email),
        interested_products: unique(profile.interested_products, 'Resources'),
      }, { transaction });
    }

    const existed = !!lead;
    if (!lead) {
      const previous = await Lead.findOne({ where: { profile_id: profile.id, is_deleted: false }, order: [['lead_update_date', 'DESC']], transaction });
      const agentId = previous?.agent_id || product.assigned_manager_id || null;
      lead = await Lead.create({ ...fields, profile_id: profile.id, status_id: 's_new', lead_update_date: fields.source_created_at, agent_id: agentId, assigned_at: agentId ? new Date() : null }, { transaction });
    } else {
      const updates = {};
      if (!lead.source_created_at || fields.source_created_at < new Date(lead.source_created_at)) updates.source_created_at = fields.source_created_at;
      if (!lead.lead_update_date || fields.source_created_at >= new Date(lead.lead_update_date)) {
        Object.assign(updates, fields, {
          source_created_at: updates.source_created_at || lead.source_created_at,
          lead_update_date: fields.source_created_at,
          extra_fields: { ...lead.extra_fields, ...fields.extra_fields },
          additional_data: { ...lead.additional_data, ...fields.additional_data },
        });
      }
      if (Object.keys(updates).length) await lead.update(updates, { transaction });
    }
    await LeadHistory.create({
      ...fields, lead_id: lead.id, profile_id: profile.id,
      change_type: existed ? 'reentry_same_product' : 'created',
      source: 'Product Space Website', recorded_at: fields.source_created_at,
    }, { transaction });
    return existed ? 'history_only' : 'created';
  }
  return dryRun ? processRow() : sequelize.transaction(processRow);
}

async function main() {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const opts = options(process.argv.slice(2));
  const { Sequelize, QueryTypes } = require('sequelize');
  const models = require('../models');
  let tps;
  try {
    const schema = process.env.TPS_DB_SCHEMA || 'tps';
    if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error('Invalid TPS_DB_SCHEMA');
    const url = process.env.TPS_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('Set TPS_DATABASE_URL or DATABASE_URL');
    const ssl = (process.env.TPS_DB_SSL ?? process.env.DB_SSL) === 'true';
    tps = new Sequelize(url, { dialect: 'postgres', dialectOptions: ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {}, pool: { max: 2, min: 0, idle: 10000 }, logging: false });
    const product = await models.Product.findByPk('Resources', { paranoid: false });
    if (!product) throw new Error('CRM product Resources does not exist');
    const table = `"${schema}"."course_enrollments"`;
    const [{ total }] = await tps.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE "createdAt" BETWEEN :from AND :to`, { replacements: opts, type: QueryTypes.SELECT });
    console.log(`Mode: ${opts.dryRun ? 'DRY RUN - no writes' : 'LIVE'}\nRange: ${opts.from.toISOString()} -> ${opts.to.toISOString()}\nEnrollments: ${total}\nTPS schema: ${schema}\nCRM database: ${models.sequelize.config.database}`);
    const counts = { created: 0, history_only: 0, duplicate: 0, unmatched: 0, failed: 0 };
    let cursor = null;
    let done = 0;
    for (;;) {
      const rows = await tps.query(`
        SELECT e.id, e.course_id, e.name, e.phone, e.form_data,
               e."createdAt" AS created_at, e."createdAt"::text AS cursor_ts,
               c.title AS course_title, u.email AS user_email, u.name AS user_name
          FROM ${table} e
          LEFT JOIN "${schema}"."courses" c ON c.id = e.course_id
          LEFT JOIN "${schema}"."users" u ON u.id = e.user_id
         WHERE e."createdAt" BETWEEN :from AND :to
           ${cursor ? 'AND (e."createdAt", e.id) > (CAST(:cursorTs AS timestamptz), :cursorId)' : ''}
         ORDER BY e."createdAt", e.id LIMIT :limit`, {
        replacements: { from: opts.from, to: opts.to, limit: opts.batch, ...(cursor || {}) }, type: QueryTypes.SELECT,
      });
      if (!rows.length) break;
      for (const row of rows) {
        try {
          const payload = mapEnrollment(row);
          const status = await importEnrollment(models, payload, product, opts.dryRun);
          counts[status]++;
          if (opts.dryRun && done < 5) console.log(`  ${row.id} | ${payload.fields.source_created_at.toISOString()} | ${row.course_title} | ${status}`);
        } catch (error) {
          counts.failed++;
          console.error(`Enrollment ${row.id}: ${error.message}`);
        }
        done++;
        if (!opts.dryRun && opts.delay) await new Promise((resolve) => setTimeout(resolve, opts.delay));
      }
      const last = rows[rows.length - 1];
      cursor = { cursorTs: last.cursor_ts, cursorId: last.id };
      console.log(`${done}/${total}: ${JSON.stringify(counts)}`);
    }
    if (opts.dryRun) console.log('Created/history counts compare against current CRM state; multiple new enrollments for one person will share a lead on import. Re-run without --dry-run to apply.');
    if (counts.failed) process.exitCode = 1;
  } finally {
    if (tps) await tps.close();
    await models.sequelize.close();
  }
}

if (require.main === module) main().catch((error) => { console.error('Backfill failed:', error.message); process.exitCode = 1; });
module.exports = { options, mapEnrollment, importEnrollment };
