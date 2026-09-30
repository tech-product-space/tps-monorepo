/**
 * UTM report — every distinct UTM value on the leads table, with its lead count.
 *
 * The five utm_* columns on `leads` are free text written by whatever created the
 * lead (the Meta cron, the resource sync, manual entry), so nothing guarantees
 * they are spelled consistently. This script is the inventory: which values
 * actually exist, and how many leads carry each one.
 *
 * Usage
 *   node src/scripts/utmReport.js
 *   node src/scripts/utmReport.js --field=utm_source
 *   node src/scripts/utmReport.js --product=DM --from=2026-01-01 --to=2026-08-24
 *   node src/scripts/utmReport.js --combos
 *   node src/scripts/utmReport.js --csv=utm-report.csv
 *
 * Flags
 *   --field=<utm_id|utm_source|utm_medium|utm_campaign|utm_content>
 *                       Report one column only. Comma-separated or repeatable.
 *                       Default: all five.
 *   --combos            Also report distinct source/medium/campaign/content
 *                       combinations (which campaign came through which source).
 *   --product=<id>      Restrict to one product_id (comma-separated for several).
 *   --from=YYYY-MM-DD   Leads whose source time is on/after this date.
 *   --to=YYYY-MM-DD     Leads whose source time is on/before this date (inclusive).
 *   --top=<n>           Keep only the n most common values per field (default: all).
 *   --min=<n>           Drop values seen fewer than n times (default: 1).
 *   --lower             Trim and case-fold before grouping, so "Facebook" and
 *                       "facebook" collapse into one row.
 *   --no-empty          Omit the "(not set)" row for leads carrying no value.
 *   --include-deleted   Count soft-deleted leads too (is_deleted = true).
 *   --csv=<path>        Write the report to CSV as well as printing it.
 */

const path = require("path");
const fs = require("fs");
const { QueryTypes } = require("sequelize");

const db = require("../models");
const { csvEscape } = require("../utils/csv");

const UTM_FIELDS = [
  "utm_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
];

const EMPTY_LABEL = "(not set)";

/* ------------------------------------------------------------------ args --- */

function parseArgs(argv) {
  const opts = {
    fields: [],
    combos: false,
    products: [],
    from: null,
    to: null,
    top: null,
    min: 1,
    lower: false,
    includeEmpty: true,
    includeDeleted: false,
    csv: null,
    help: false,
  };

  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, "").split("=");

    switch (key) {
      case "field":
      case "fields":
        opts.fields.push(...String(value || "").split(","));
        break;
      case "combos":
        opts.combos = true;
        break;
      case "product":
      case "products":
        opts.products.push(...String(value || "").split(","));
        break;
      case "from":
        opts.from = value;
        break;
      case "to":
        opts.to = value;
        break;
      case "top":
        opts.top = Number(value) || null;
        break;
      case "min":
        opts.min = Number(value) || 1;
        break;
      case "lower":
        opts.lower = true;
        break;
      case "no-empty":
        opts.includeEmpty = false;
        break;
      case "include-deleted":
        opts.includeDeleted = true;
        break;
      case "csv":
        opts.csv = value || "utm-report.csv";
        break;
      case "help":
      case "h":
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown flag: --${key}`);
    }
  }

  opts.fields = opts.fields.map((f) => f.trim()).filter(Boolean);
  opts.products = opts.products.map((p) => p.trim()).filter(Boolean);

  const unknown = opts.fields.filter((f) => !UTM_FIELDS.includes(f));
  if (unknown.length) {
    throw new Error(
      `Unknown UTM field(s): ${unknown.join(", ")}. ` +
        `Valid: ${UTM_FIELDS.join(", ")}`
    );
  }
  if (!opts.fields.length) opts.fields = [...UTM_FIELDS];

  return opts;
}

/* ------------------------------------------------------------------- sql --- */

/**
 * Shared WHERE for every query, so the totals and the per-field counts are
 * always drawn from exactly the same set of leads.
 *
 * Date filtering runs on COALESCE(source_created_at, created_at): source time is
 * when the lead actually came in (Meta's created_time, the resource form's
 * timestamp), which is what a UTM report is about — created_at is only when our
 * row happened to be written.
 */
function buildWhere(opts) {
  const clauses = [];
  const replacements = {};

  if (!opts.includeDeleted) clauses.push("l.is_deleted = false");

  if (opts.products.length) {
    clauses.push("l.product_id IN (:products)");
    replacements.products = opts.products;
  }
  if (opts.from) {
    clauses.push("COALESCE(l.source_created_at, l.created_at) >= :from");
    replacements.from = `${opts.from} 00:00:00`;
  }
  if (opts.to) {
    clauses.push("COALESCE(l.source_created_at, l.created_at) <= :to");
    replacements.to = `${opts.to} 23:59:59`;
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    replacements,
  };
}

/** A UTM column normalised for grouping: trimmed, optionally case-folded. */
function normalisedColumn(field, lower) {
  const trimmed = `NULLIF(TRIM(l.${field}), '')`;
  return lower ? `LOWER(${trimmed})` : trimmed;
}

async function countLeads(where) {
  const [row] = await db.sequelize.query(
    `SELECT COUNT(*)::int AS total FROM leads l ${where.sql}`,
    { type: QueryTypes.SELECT, replacements: where.replacements }
  );
  return row.total;
}

async function countField(field, where, opts) {
  const expr = normalisedColumn(field, opts.lower);

  const rows = await db.sequelize.query(
    `SELECT COALESCE(${expr}, :empty) AS name,
            COUNT(*)::int             AS count
       FROM leads l
       ${where.sql}
      GROUP BY 1
     HAVING COUNT(*) >= :min
      ORDER BY count DESC, name ASC`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        ...where.replacements,
        empty: EMPTY_LABEL,
        min: opts.min,
      },
    }
  );

  const filtered = opts.includeEmpty
    ? rows
    : rows.filter((r) => r.name !== EMPTY_LABEL);

  return opts.top ? filtered.slice(0, opts.top) : filtered;
}

async function countCombos(where, opts) {
  const cols = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  const exprs = cols.map(
    (c) => `COALESCE(${normalisedColumn(c, opts.lower)}, :empty) AS ${c}`
  );

  const rows = await db.sequelize.query(
    `SELECT ${exprs.join(",\n            ")},
            COUNT(*)::int AS count
       FROM leads l
       ${where.sql}
      GROUP BY 1, 2, 3, 4
     HAVING COUNT(*) >= :min
      ORDER BY count DESC`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        ...where.replacements,
        empty: EMPTY_LABEL,
        min: opts.min,
      },
    }
  );

  // --no-empty drops only the all-blank combo — a row where three of the four
  // are set is still a real combination worth reporting.
  const filtered = opts.includeEmpty
    ? rows
    : rows.filter((r) => cols.some((c) => r[c] !== EMPTY_LABEL));

  return opts.top ? filtered.slice(0, opts.top) : filtered;
}

/* ---------------------------------------------------------------- output --- */

function share(count, total) {
  if (!total) return "0.0%";
  return `${((count / total) * 100).toFixed(1)}%`;
}

function printTable(title, rows, total) {
  const heading = `${title}  —  ${rows.length} distinct value(s)`;
  console.log(`\n${heading}`);
  console.log("-".repeat(heading.length));

  if (!rows.length) {
    console.log("  (nothing)");
    return;
  }

  const nameWidth = Math.min(
    60,
    Math.max(4, ...rows.map((r) => String(r.name).length))
  );
  const countWidth = Math.max(5, ...rows.map((r) => String(r.count).length));

  console.log(
    `  ${"NAME".padEnd(nameWidth)}  ${"COUNT".padStart(countWidth)}   SHARE`
  );

  for (const row of rows) {
    const name = String(row.name);
    const shown =
      name.length > nameWidth ? `${name.slice(0, nameWidth - 1)}…` : name;
    console.log(
      `  ${shown.padEnd(nameWidth)}  ${String(row.count).padStart(
        countWidth
      )}   ${share(row.count, total)}`
    );
  }
}

function printCombos(rows, total) {
  const heading =
    `COMBINATIONS  —  ${rows.length} distinct ` +
    `source | medium | campaign | content`;
  console.log(`\n${heading}`);
  console.log("-".repeat(heading.length));

  if (!rows.length) {
    console.log("  (nothing)");
    return;
  }

  for (const r of rows) {
    console.log(
      `  ${String(r.count).padStart(6)}  ${share(r.count, total).padStart(6)}  ` +
        `${r.utm_source} | ${r.utm_medium} | ${r.utm_campaign} | ${r.utm_content}`
    );
  }
}

function writeCsv(target, perField, combos, total) {
  const lines = ["field,name,count,share"];

  for (const [field, rows] of Object.entries(perField)) {
    for (const row of rows) {
      lines.push(
        [field, csvEscape(row.name), row.count, share(row.count, total)].join(
          ","
        )
      );
    }
  }

  if (combos) {
    lines.push("");
    lines.push("utm_source,utm_medium,utm_campaign,utm_content,count,share");
    for (const r of combos) {
      lines.push(
        [
          csvEscape(r.utm_source),
          csvEscape(r.utm_medium),
          csvEscape(r.utm_campaign),
          csvEscape(r.utm_content),
          r.count,
          share(r.count, total),
        ].join(",")
      );
    }
  }

  const out = path.resolve(process.cwd(), target);
  fs.writeFileSync(out, `${lines.join("\n")}\n`, "utf8");
  return out;
}

/** The doc comment at the top of this file, reused as --help output. */
function usage() {
  return fs.readFileSync(__filename, "utf8").split("*/")[0];
}

/* ------------------------------------------------------------------- run --- */

async function run() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n`);
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (opts.help) {
    console.log(usage());
    return;
  }

  try {
    await db.sequelize.authenticate();

    const where = buildWhere(opts);
    const total = await countLeads(where);

    const scope = [
      opts.products.length ? `products: ${opts.products.join(", ")}` : null,
      opts.from ? `from ${opts.from}` : null,
      opts.to ? `to ${opts.to}` : null,
      opts.includeDeleted ? "including deleted" : "excluding deleted",
      opts.lower ? "case-folded" : "case-sensitive",
      opts.min > 1 ? `min count ${opts.min}` : null,
      opts.top ? `top ${opts.top} per field` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    console.log(`\nUTM report — ${total} lead(s) in scope`);
    console.log(scope);

    const perField = {};
    for (const field of opts.fields) {
      perField[field] = await countField(field, where, opts);
      printTable(field.toUpperCase(), perField[field], total);
    }

    let combos = null;
    if (opts.combos) {
      combos = await countCombos(where, opts);
      printCombos(combos, total);
    }

    if (opts.csv) {
      console.log(`\nCSV written to ${writeCsv(opts.csv, perField, combos, total)}`);
    }

    console.log("");
  } catch (err) {
    console.error("UTM report failed:", err.message);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

run();
