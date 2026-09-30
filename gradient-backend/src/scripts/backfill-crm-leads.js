/**
 * Backfills historical website leads into the shared Product Space CRM.
 *
 * The four newly wired forms (blog counselling, free-course counselling, free
 * course enrollment, resource download) only reach the CRM from their deploy
 * onward. Everything submitted before that is sitting in this database and has
 * never been seen there. This sends it, one lead at a time.
 *
 *   node src/scripts/backfill-crm-leads.js                      # dry run, safe flows
 *   node src/scripts/backfill-crm-leads.js --execute            # actually send
 *   node src/scripts/backfill-crm-leads.js resources --execute --limit 50
 *   node src/scripts/backfill-crm-leads.js --execute --delay 1000
 *
 * **Dry run is the default.** Nothing is posted and nothing is stamped until
 * `--execute` is passed, so the first run is always a report.
 *
 * ── Tracked, so it can be stopped and resumed ────────────────────────────────
 *
 * Every row that reaches the CRM is stamped in place — `additionalData.crmBackfill`
 * on `leads` and `ResourceLeads`, `formData.crmBackfill` on `FreeCourseEnrollments`
 * — with the run id, the timestamp, the CRM's own CREATED/RE_ENTRY verdict, and
 * the error if it failed. A stamped row is skipped on every later run, so
 * re-running after a crash, a network drop, or a Ctrl-C resumes exactly where it
 * stopped and never sends the same lead twice.
 *
 * That matters more than it sounds: the CRM dedups by phone and turns a second
 * arrival into a *re-entry*, which resets the lead's status and bumps it to the
 * top of recency sorts. A double-sent backfill is not a harmless duplicate — it
 * is an agent's work quietly undone.
 *
 * The stamp is written with `hooks: false, silent: true`, so it fires no
 * lead-event emitters and does not touch `updatedAt`. It is bookkeeping, not a
 * change to the lead.
 *
 * Alongside the stamps, every processed row — sent, rejected or skipped — is
 * appended to a JSONL run log (`--log-dir`, default `./crm-backfill-logs`), which
 * is the audit trail: what was sent, what came back, and why anything was left
 * out.
 *
 * ── One at a time, on purpose ────────────────────────────────────────────────
 *
 * Each CRM call opens a transaction over there; the CRM's own CSV importer
 * processes rows sequentially for the same reason. This posts one lead, waits
 * `--delay` ms (default 400), then posts the next. No parallelism, no batching.
 * A run over ten thousand leads is meant to take an hour, not to arrive as a
 * spike. `--limit` caps a run if you would rather do it in sittings.
 *
 * ── The live callback product is opt-in ──────────────────────────────────────
 *
 * `GRADIENT_FREE_COURSE` and `GRADIENT_RESOURCES` are new products with no leads
 * in them, so backfilling them can only create. `GRADIENT_CALLBACK` is live —
 * tools, advisor and recordings leads are in there being worked right now — and
 * any backfilled counselling row whose phone already has a callback lead will
 * re-enter it: status forced to "Re-entry", update date bumped to today. So the
 * two counselling flows run only when named explicitly *and* accompanied by
 * `--include-live-callback`. Read that flag as "yes, I accept the re-entries".
 *
 * ── Prerequisite ─────────────────────────────────────────────────────────────
 *
 * The CRM products and subsources must exist first. An unrecognised product_id
 * files the lead under "General Inquiry" and an unrecognised subsource is dropped
 * — both silently, with a 200 back. Backfilling before the rows exist produces
 * thousands of leads in the wrong place and stamps them all as done.
 *
 * Needs CRM_URL in the environment (or --crm-url=https://…), and Node 18+ for
 * global fetch.
 */

import "dotenv/config";

import fs from "fs";
import path from "path";
import { Op } from "sequelize";

import db from "../database/postgres/models/index.js";
import env from "../config/env.js";

const { Lead, ResourceLead, FreeCourseEnrollment } = db;

/* ── arguments ───────────────────────────────────────────────────────────── */

const ARGV = process.argv.slice(2);

const flag = (name) => ARGV.includes(`--${name}`);

const option = (name, fallback) => {
  const inline = ARGV.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);

  const index = ARGV.indexOf(`--${name}`);
  if (index !== -1 && ARGV[index + 1] && !ARGV[index + 1].startsWith("--")) {
    return ARGV[index + 1];
  }

  return fallback;
};

const EXECUTE = flag("execute");
const INCLUDE_LIVE_CALLBACK = flag("include-live-callback");
const RETRY_REJECTED = flag("retry-rejected");
const DELAY_MS = Number(option("delay", 400));
const LIMIT = Number(option("limit", 0)) || Infinity;
const LOG_DIR = option("log-dir", "crm-backfill-logs");
const CRM_URL = (option("crm-url", env.crm.baseUrl) || "").replace(/\/$/, "");

/** Options that take a value, so `--limit 50` does not read 50 as a flow name. */
const VALUE_OPTIONS = new Set(["delay", "limit", "log-dir", "crm-url"]);

/** Flow names given as bare arguments; empty means "the safe ones". */
const REQUESTED = [];
for (let i = 0; i < ARGV.length; i += 1) {
  const arg = ARGV[i];

  if (arg.startsWith("--")) {
    const name = arg.slice(2).split("=")[0];
    if (VALUE_OPTIONS.has(name) && !arg.includes("=")) i += 1;
    continue;
  }

  REQUESTED.push(arg);
}

const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");

/** Rows read per query. Reading is cheap; it is the posting that is paced. */
const PAGE = 200;

/** Network failures worth a second try. A 4xx is a verdict, not a hiccup. */
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── flow definitions ────────────────────────────────────────────────────── */

/**
 * `stampField` is the JSONB column the crmBackfill record lives in — the one
 * each table already uses for its loose extras, so no migration is needed.
 *
 * `build` returns the CRM payload, or a string reason to skip the row. It
 * deliberately mirrors what the live form sends, key for key: a backfilled lead
 * and a lead submitted today should be indistinguishable in the CRM.
 */
const FLOWS = {
  resources: {
    label: "Resource downloads",
    product: "GRADIENT_RESOURCES / Download",
    model: ResourceLead,
    stampField: "additionalData",
    safe: true,
    query: {
      include: [{ association: "resource", attributes: ["title", "resourceSlug"] }],
    },
    build: (row) => {
      if (!row.phone) return "no phone";
      if (!row.email) return "no email";

      const utm = row.additionalData || {};

      return {
        product_id: "GRADIENT_RESOURCES",
        subsource: "Download",

        name: row.name,
        email: row.email,
        phone: row.phone,
        country_code: row.countryCode || "+91",

        utm_id: utm.utmId,
        utm_source: utm.utmSource,
        utm_medium: utm.utmMedium,
        utm_campaign: utm.utmCampaign,
        utm_content: utm.utmContent,

        extra_fields: {
          resourceName: row.resource?.title || "",
          resourceJobTitle: row.jobTitle || "",
        },
        additional_data: {
          resource_id: row.resourceId,
          resourceSlug: row.resource?.resourceSlug,
        },
      };
    },
  },

  "free-course-enrollments": {
    label: "Free course enrollments",
    product: "GRADIENT_FREE_COURSE / Enrollment",
    model: FreeCourseEnrollment,
    stampField: "formData",
    safe: true,
    query: {
      include: [
        { association: "user", attributes: ["fullName", "email"] },
        { association: "course", attributes: ["title", "slug"] },
      ],
    },
    build: (row) => {
      if (!row.phone) return "no phone";
      // The form never collected an email — it is the account's, exactly as the
      // live enrollment now sends it. An enrollment by a user without one is not
      // a lead anybody can act on.
      if (!row.user?.email) return "no email on the account";

      const form = row.formData || {};
      const utm = form.additionalData || {};
      const student = form.attendeeType === "Student";
      const professional = form.attendeeType === "Professional";

      return {
        product_id: "GRADIENT_FREE_COURSE",
        subsource: "Enrollment",

        name: row.name || row.user.fullName || "",
        email: row.user.email,
        phone: row.phone,
        country_code: form.countryCode || "+91",

        utm_id: utm.utmId,
        utm_source: utm.utmSource,
        utm_medium: utm.utmMedium,
        utm_campaign: utm.utmCampaign,
        utm_content: utm.utmContent,

        extra_fields: {
          courseName: row.course?.title || "",
          linkedin: form.linkedinUrl || "",
          profession: form.attendeeType || "",
          role: professional ? form.role || "" : "",
          collegeName: student ? form.collegeName || "" : "",
          yearOfGraduation: student ? form.graduationYear || "" : "",
        },
        additional_data: {
          freeCourseId: row.courseId,
          freeCourseSlug: row.course?.slug,
        },
      };
    },
  },

  "blog-counselling": {
    label: "Blog counselling calls",
    product: "GRADIENT_CALLBACK / Blog Page",
    model: Lead,
    stampField: "additionalData",
    safe: false,
    query: { where: { source: "blog", subSource: "free_counselling_call" } },
    build: (row) => {
      if (!row.phone) return "no phone";
      if (!row.email) return "no email";

      const extra = row.additionalData || {};

      return {
        product_id: "GRADIENT_CALLBACK",
        subsource: "Blog Page",

        name: row.name,
        email: row.email,
        phone: row.phone,
        country_code: row.countryCode || "+91",

        utm_id: row.utmId,
        utm_source: row.utmSource,
        utm_medium: row.utmMedium,
        utm_campaign: row.utmCampaign,
        utm_content: row.utmContent,

        extra_fields: {
          graduationYear: extra.graduationYear || "",
          jobTitle: extra.jobTitle || "",
        },
        additional_data: { pageUrl: row.pageUrl || undefined },
      };
    },
  },

  "free-course-counselling": {
    label: "Free-course counselling calls",
    product: "GRADIENT_CALLBACK / Free Course",
    model: Lead,
    stampField: "additionalData",
    safe: false,
    query: {
      where: { source: "free-courses", subSource: "free_counselling_call" },
    },
    build: (row) => {
      if (!row.phone) return "no phone";
      if (!row.email) return "no email";

      const extra = row.additionalData || {};

      return {
        product_id: "GRADIENT_CALLBACK",
        subsource: "Free Course",

        name: row.name,
        email: row.email,
        phone: row.phone,
        country_code: row.countryCode || "+91",

        utm_id: row.utmId,
        utm_source: row.utmSource,
        utm_medium: row.utmMedium,
        utm_campaign: row.utmCampaign,
        utm_content: row.utmContent,

        extra_fields: {
          freeCourseTitle: extra.freeCourseTitle || "",
          graduationYear: extra.graduationYear || "",
          jobTitle: extra.jobTitle || "",
        },
        additional_data: {
          freeCourseId: extra.freeCourseId,
          freeCourseUrl: extra.freeCourseUrl,
        },
      };
    },
  },
};

/* ── run log ─────────────────────────────────────────────────────────────── */

const logFile = path.join(LOG_DIR, `crm-backfill-${RUN_ID}.jsonl`);
let logStream = null;

const openLog = () => {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  logStream = fs.createWriteStream(logFile, { flags: "a" });
};

const log = (entry) => {
  logStream?.write(`${JSON.stringify({ runId: RUN_ID, ...entry })}\n`);
};

/* ── stamps ──────────────────────────────────────────────────────────────── */

const readStamp = (row, field) => (row[field] || {}).crmBackfill || null;

/**
 * Records the outcome on the source row itself.
 *
 * `hooks: false` keeps the lead-event emitters out of it — this is not a new
 * lead — and `silent: true` leaves `updatedAt` alone, so a backfill does not
 * make every historical row look freshly touched.
 */
const writeStamp = async (row, field, record) => {
  const next = { ...(row[field] || {}), crmBackfill: record };

  await row.update({ [field]: next }, { hooks: false, silent: true });
};

/* ── the CRM call ────────────────────────────────────────────────────────── */

/**
 * Posts one lead. Retries only what is worth retrying: a network error or a 5xx
 * may be transient, a 4xx is the CRM telling us this row is not acceptable and
 * will say the same thing next time.
 */
const postLead = async (payload) => {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${CRM_URL}/api/v1/leads/external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // A hung connection must not stall the whole run — the retry below is a
        // better answer than waiting forever on one lead.
        signal: AbortSignal.timeout(30_000),
      });

      const body = await response.text();

      if (response.ok) {
        let parsed = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          // A 200 with an unparseable body still means it landed.
        }
        return { ok: true, attempt, crmStatus: parsed.status || null };
      }

      if (response.status < 500) {
        return {
          ok: false,
          attempt,
          retryable: false,
          error: `${response.status} ${body.slice(0, 300)}`,
        };
      }

      lastError = `${response.status} ${body.slice(0, 300)}`;
    } catch (error) {
      lastError = error.message;
    }

    if (attempt < MAX_ATTEMPTS) await sleep(DELAY_MS * attempt * 2);
  }

  return { ok: false, attempt: MAX_ATTEMPTS, retryable: true, error: lastError };
};

/* ── the run ─────────────────────────────────────────────────────────────── */

/**
 * Pages a table oldest-first by (createdAt, id).
 *
 * Chronological order is not cosmetic: where one person submitted more than
 * once, the CRM lead ends up holding the last payload processed, so oldest-first
 * leaves it holding their most recent submission. Keyset paging rather than
 * OFFSET because the script writes to these same rows as it goes.
 */
const eachRow = async function* (model, query) {
  let cursor = null;

  for (;;) {
    const where = { ...(query.where || {}) };

    if (cursor) {
      where[Op.or] = [
        { createdAt: { [Op.gt]: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { [Op.gt]: cursor.id } },
      ];
    }

    const rows = await model.findAll({
      ...query,
      where,
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
      limit: PAGE,
    });

    if (!rows.length) return;

    for (const row of rows) yield row;

    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
};

const runFlow = async (key, budget) => {
  const flow = FLOWS[key];
  const stats = {
    seen: 0,
    sent: 0,
    created: 0,
    reentry: 0,
    rejected: 0,
    alreadyDone: 0,
    previouslyRejected: 0,
    unsendable: 0,
    stoppedAtLimit: false,
  };

  let oldest = null;
  let newest = null;

  for await (const row of eachRow(flow.model, flow.query || {})) {
    stats.seen += 1;
    oldest ??= row.createdAt;
    newest = row.createdAt;

    const stamp = readStamp(row, flow.stampField);

    // A row that reached the CRM is never sent again — a second arrival would
    // be a re-entry, not a duplicate row, and would reset a status somebody set.
    if (stamp?.status === "sent") {
      stats.alreadyDone += 1;
      continue;
    }

    // A rejection is a verdict the CRM will repeat, so it stays skipped until
    // asked for explicitly — after the underlying row has been fixed.
    if (stamp?.status === "rejected" && !RETRY_REJECTED) {
      stats.previouslyRejected += 1;
      continue;
    }

    const payload = flow.build(row);

    if (typeof payload === "string") {
      stats.unsendable += 1;
      log({
        flow: key,
        sourceId: row.id,
        createdAt: row.createdAt,
        status: "unsendable",
        reason: payload,
      });
      continue;
    }

    payload.source_created_at = row.createdAt.toISOString();
    // Distinct from the live "Gradient Website" so the import is legible in each
    // lead's activity trail afterwards.
    payload.external_source = "Gradient Website Backfill";
    // Never send an agent_id key, not even null: the CRM treats the key's mere
    // presence as an intentional override and cascades it across every lead that
    // person has, which would unassign live work.

    if (stats.sent + stats.rejected >= budget.remaining) {
      stats.stoppedAtLimit = true;
      break;
    }

    if (!EXECUTE) {
      stats.sent += 1;
      log({
        flow: key,
        sourceId: row.id,
        createdAt: row.createdAt,
        status: "would-send",
        payload,
      });
      continue;
    }

    const result = await postLead(payload);

    const record = {
      runId: RUN_ID,
      at: new Date().toISOString(),
      status: result.ok ? "sent" : "rejected",
      crmStatus: result.crmStatus || null,
      attempts: result.attempt,
      error: result.ok ? null : result.error,
    };

    await writeStamp(row, flow.stampField, record);

    log({
      flow: key,
      sourceId: row.id,
      createdAt: row.createdAt,
      phone: payload.phone,
      email: payload.email,
      ...record,
    });

    if (result.ok) {
      stats.sent += 1;
      if (result.crmStatus === "RE_ENTRY") stats.reentry += 1;
      else stats.created += 1;
    } else {
      stats.rejected += 1;
      console.error(`  ✗ ${row.id}: ${result.error}`);
    }

    await sleep(DELAY_MS);
  }

  budget.remaining -= stats.sent + stats.rejected;

  return { ...stats, oldest, newest };
};

const main = async () => {
  if (typeof fetch !== "function") {
    throw new Error("Node 18 or newer is required (global fetch is missing).");
  }

  const unknown = REQUESTED.filter((name) => !FLOWS[name]);
  if (unknown.length) {
    throw new Error(
      `Unknown flow(s): ${unknown.join(", ")}. Known: ${Object.keys(FLOWS).join(", ")}`,
    );
  }

  let flows = REQUESTED.length
    ? REQUESTED
    : Object.keys(FLOWS).filter((key) => FLOWS[key].safe);

  const blocked = flows.filter((key) => !FLOWS[key].safe && !INCLUDE_LIVE_CALLBACK);
  if (blocked.length) {
    console.log(
      `\nSkipping ${blocked.join(", ")}: these file under GRADIENT_CALLBACK, which is\n` +
        `live. Anyone who already has a callback lead would have it reset to\n` +
        `"Re-entry" with today's update date. Pass --include-live-callback to accept that.`,
    );
    flows = flows.filter((key) => FLOWS[key].safe);
  }

  if (!flows.length) {
    console.log("Nothing to do.");
    await db.sequelize.close();
    return;
  }

  if (EXECUTE && !CRM_URL) {
    throw new Error("CRM_URL is not set. Pass --crm-url=https://… or set it in .env");
  }

  openLog();

  console.log(
    `\n${EXECUTE ? "SENDING" : "DRY RUN — nothing will be sent or stamped"}\n` +
      `  flows   ${flows.join(", ")}\n` +
      `  crm     ${CRM_URL || "(not needed for a dry run)"}\n` +
      `  pacing  one lead every ${DELAY_MS}ms, sequential\n` +
      `  limit   ${LIMIT === Infinity ? "none" : LIMIT}\n` +
      `  log     ${logFile}\n`,
  );

  const budget = { remaining: LIMIT };
  const started = Date.now();
  const summary = {};

  for (const key of flows) {
    const flow = FLOWS[key];
    console.log(`${flow.label} → ${flow.product || ""}`.trim());

    const stats = await runFlow(key, budget);
    summary[key] = stats;

    const range =
      stats.oldest && stats.newest
        ? ` · ${stats.oldest.toISOString().slice(0, 10)} → ${stats.newest
            .toISOString()
            .slice(0, 10)}`
        : "";

    console.log(
      `  ${stats.seen} rows${range}\n` +
        `  ${EXECUTE ? "sent" : "would send"} ${stats.sent}` +
        (EXECUTE ? ` (${stats.created} new, ${stats.reentry} re-entry)` : "") +
        ` · ${stats.alreadyDone} already done` +
        (stats.previouslyRejected
          ? ` · ${stats.previouslyRejected} previously rejected (--retry-rejected to retry)`
          : "") +
        ` · ${stats.unsendable} unsendable` +
        ` · ${stats.rejected} rejected` +
        (stats.stoppedAtLimit ? " · stopped at --limit" : "") +
        "\n",
    );

    if (budget.remaining <= 0) break;
  }

  const totals = Object.values(summary).reduce(
    (acc, s) => ({
      sent: acc.sent + s.sent,
      rejected: acc.rejected + s.rejected,
      unsendable: acc.unsendable + s.unsendable,
      alreadyDone: acc.alreadyDone + s.alreadyDone,
    }),
    { sent: 0, rejected: 0, unsendable: 0, alreadyDone: 0 },
  );

  console.log(
    `${EXECUTE ? "Sent" : "Would send"} ${totals.sent} · ` +
      `${totals.rejected} rejected · ${totals.unsendable} unsendable · ` +
      `${totals.alreadyDone} already done  ` +
      `(${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
  console.log(`Run log: ${logFile}`);

  if (!EXECUTE) {
    console.log("\nRe-run with --execute to send. Rows are stamped as they go,");
    console.log("so a stopped run resumes without re-sending anything.");
  }

  logStream?.end();
  await db.sequelize.close();
};

main().catch(async (error) => {
  console.error("\nBackfill failed:", error.message);
  logStream?.end();
  try {
    await db.sequelize.close();
  } catch {
    // already closed
  }
  process.exit(1);
});
