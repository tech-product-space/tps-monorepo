#!/usr/bin/env node
"use strict";

/**
 * Find leads/people whose NOTES contain a given search string, export as CSV.
 *
 * Notes live in `lead_notes` and are profile-scoped (shared across all of a
 * person's product leads). Matching is case-insensitive substring by default.
 *
 * Usage:
 *   node scripts/find-leads-by-note.js "<search text>" [outfile.csv] [flags]
 *
 *   node scripts/find-leads-by-note.js "refund"
 *   node scripts/find-leads-by-note.js "not interested" not-interested.csv
 *   node scripts/find-leads-by-note.js "cohort 5" --by-person
 *
 * Flags:
 *   --by-person   one row per person (matching notes aggregated) instead of one
 *                 row per matching note
 *   --regex       treat the query as a POSIX regex (case-insensitive) instead of
 *                 a plain substring
 *   --whole-word  match the query only as a whole word (ignored with --regex)
 */

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/models");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows, columns) {
  const header = columns.join(",");
  const body = rows
    .map((row) => columns.map((col) => csvEscape(row[col])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));

  const query = positional[0];
  if (!query) {
    console.error(
      'Usage: node scripts/find-leads-by-note.js "<search text>" [outfile.csv] [--by-person] [--regex] [--whole-word]',
    );
    process.exit(1);
  }

  const byPerson = flags.has("--by-person");
  const useRegex = flags.has("--regex");
  const wholeWord = flags.has("--whole-word");

  // Build the WHERE predicate + bound parameter for the note content match.
  let matchClause;
  let pattern;
  if (useRegex) {
    matchClause = "n.content ~* :pattern"; // POSIX regex, case-insensitive
    pattern = query;
  } else if (wholeWord) {
    // \m ... \M are Postgres word boundaries; escape regex metachars in query.
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matchClause = "n.content ~* :pattern";
    pattern = `\\m${escaped}\\M`;
  } else {
    // Plain case-insensitive substring; escape LIKE wildcards in the query.
    const escaped = query.replace(/([%_\\])/g, "\\$1");
    matchClause = "n.content ILIKE :pattern";
    pattern = `%${escaped}%`;
  }

  let sql;
  if (byPerson) {
    sql = `
      SELECT
        p.id                                   AS profile_id,
        p.name                                 AS person_name,
        p.phone                                AS phone,
        p.email                                AS email,
        count(*)                               AS match_count,
        string_agg(
          to_char(n.created_at, 'YYYY-MM-DD') || ' [' || COALESCE(nu.name, 'System') || '] ' || n.content,
          E'\n' ORDER BY n.created_at)         AS matched_notes
      FROM lead_notes n
      JOIN lead_profiles p ON p.id = n.profile_id
      LEFT JOIN users nu ON nu.id = n.actor_id
      WHERE ${matchClause}
      GROUP BY p.id, p.name, p.phone, p.email
      ORDER BY p.name;
    `;
  } else {
    sql = `
      SELECT
        n.id                                   AS note_id,
        n.lead_id                              AS lead_id,
        p.id                                   AS profile_id,
        p.name                                 AS person_name,
        p.phone                                AS phone,
        p.email                                AS email,
        l.product_id                           AS product_id,
        n.type                                 AS note_type,
        COALESCE(nu.name, 'System')            AS note_author,
        n.created_at                           AS note_created_at,
        n.content                              AS matched_note
      FROM lead_notes n
      JOIN lead_profiles p ON p.id = n.profile_id
      LEFT JOIN leads l ON l.id = n.lead_id
      LEFT JOIN users nu ON nu.id = n.actor_id
      WHERE ${matchClause}
      ORDER BY person_name, n.created_at;
    `;
  }

  const rows = await sequelize.query(sql, {
    replacements: { pattern },
    type: sequelize.QueryTypes.SELECT,
  });

  const mode = useRegex ? "regex" : wholeWord ? "whole-word" : "substring";
  console.log(
    `Searched notes for "${query}" (${mode}) — ${rows.length} ${byPerson ? "people" : "matching notes"} found.`,
  );

  const columns = byPerson
    ? ["profile_id", "person_name", "phone", "email", "match_count", "matched_notes"]
    : [
        "note_id",
        "lead_id",
        "profile_id",
        "person_name",
        "phone",
        "email",
        "product_id",
        "note_type",
        "note_author",
        "note_created_at",
        "matched_note",
      ];

  const csv = toCsv(rows, columns);

  const safeQuery = query.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
  const defaultOut = `notes-search-${safeQuery || "results"}.csv`;
  const outFile = path.resolve(positional[1] || defaultOut);
  fs.writeFileSync(outFile, csv, "utf8");
  console.log(`Wrote CSV -> ${outFile}`);
}

main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error("Error:", err.message);
    await sequelize.close();
    process.exit(1);
  });
