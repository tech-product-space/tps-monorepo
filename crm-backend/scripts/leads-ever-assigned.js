#!/usr/bin/env node
"use strict";

/**
 * Export every lead an agent was EVER assigned to (past or present) as CSV.
 *
 * The lead's CURRENT owner lives in leads.agent_id, but that column is
 * overwritten on reassignment. Historical ownership is reconstructed from the
 * `activities` audit trail:
 *   - type='Assignment'  -> metadata.new.agent_id / metadata.old.agent_id
 *   - type='System'      -> metadata.agent_id  (the initial assignment at creation)
 *
 * Caveat: results are only as complete as the activity log. Assignments made by
 * raw DB updates that bypassed the service layer will not appear.
 *
 * Usage:
 *   node scripts/leads-ever-assigned.js <agent-email | agent-name | agent-uuid> [outfile.csv]
 *   node scripts/leads-ever-assigned.js jane@acme.com
 *   node scripts/leads-ever-assigned.js "Jane Doe" jane-leads.csv
 *   node scripts/leads-ever-assigned.js 3f0c... --by-person
 *
 * Flags:
 *   --by-person   collapse to one row per LeadProfile (person) instead of per Lead
 *   --include-deleted   include soft-deleted leads (is_deleted = true)
 */

const fs = require("fs");
const path = require("path");
const { sequelize, User } = require("../src/models");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function resolveAgent(identifier) {
  const { Op } = require("sequelize");
  const where = UUID_RE.test(identifier)
    ? { id: identifier }
    : {
        [Op.or]: [
          { email: identifier },
          sequelize.where(
            sequelize.fn("lower", sequelize.col("name")),
            identifier.toLowerCase(),
          ),
        ],
      };

  const matches = await User.findAll({
    where,
    attributes: ["id", "name", "email", "role"],
  });

  if (matches.length === 0) {
    throw new Error(`No user found matching "${identifier}".`);
  }
  if (matches.length > 1) {
    const list = matches
      .map((m) => `  - ${m.name} <${m.email}> (${m.id})`)
      .join("\n");
    throw new Error(
      `Multiple users match "${identifier}". Re-run with the exact UUID:\n${list}`,
    );
  }
  return matches[0];
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));

  const identifier = positional[0];
  if (!identifier) {
    console.error(
      "Usage: node scripts/leads-ever-assigned.js <agent-email|name|uuid> [outfile.csv] [--by-person] [--include-deleted]",
    );
    process.exit(1);
  }

  const byPerson = flags.has("--by-person");
  const includeDeleted = flags.has("--include-deleted");

  const agent = await resolveAgent(identifier);
  console.log(
    `Resolved agent: ${agent.name} <${agent.email}> (${agent.role}) — ${agent.id}`,
  );

  const deletedClause = includeDeleted ? "" : "AND l.is_deleted = false";

  // Aggregate a person's notes (lead_notes are profile-scoped, so shared across
  // all of that person's product leads) into one newline-separated column.
  const notesSubquery = `
    (SELECT string_agg(
       to_char(n.created_at, 'YYYY-MM-DD') || ' [' || COALESCE(nu.name, 'System') || '] ' || n.content,
       E'\n' ORDER BY n.created_at)
     FROM lead_notes n
     LEFT JOIN users nu ON nu.id = n.actor_id
     WHERE n.profile_id = p.id)`;

  // The `agent_id` values inside activities.metadata are stored as JSON strings,
  // so we compare against the agent UUID as text.
  const sql = `
    SELECT DISTINCT
      ${byPerson ? "" : "l.id                AS lead_id,"}
      p.id                                   AS profile_id,
      p.name                                 AS person_name,
      p.phone                                AS phone,
      p.email                                AS email,
      ${byPerson ? "" : "l.product_id        AS product_id,"}
      ${byPerson ? "" : "l.status_id         AS status_id,"}
      ${byPerson ? "" : "cu.name             AS current_agent,"}
      ${byPerson ? "" : "(l.agent_id = :agentId) AS currently_owned,"}
      ${byPerson ? "" : "l.assigned_at       AS assigned_at,"}
      ${byPerson ? "" : "l.created_at        AS lead_created_at,"}
      ${byPerson ? "bool_or(l.agent_id = :agentId) AS currently_owned," : ""}
      ${notesSubquery} AS notes
    FROM leads l
    JOIN lead_profiles p ON p.id = l.profile_id
    ${byPerson ? "" : "LEFT JOIN users cu ON cu.id = l.agent_id"}
    WHERE 1 = 1
      ${deletedClause}
      AND (
        l.agent_id = :agentId
        OR EXISTS (
          SELECT 1 FROM activities a
          WHERE a.lead_id = l.id
            AND (
              (a.type = 'Assignment' AND (
                    a.metadata #>> '{new,agent_id}' = :agentIdText
                 OR a.metadata #>> '{old,agent_id}' = :agentIdText))
              OR (a.type = 'System' AND a.metadata ->> 'agent_id' = :agentIdText)
            )
        )
      )
    ${byPerson ? "GROUP BY p.id, p.name, p.phone, p.email" : ""}
    ORDER BY ${byPerson ? "p.name" : "person_name, product_id"};
  `;

  const rows = await sequelize.query(sql, {
    replacements: {
      agentId: agent.id,
      agentIdText: agent.id,
    },
    type: sequelize.QueryTypes.SELECT,
  });

  console.log(
    `Found ${rows.length} ${byPerson ? "people" : "leads"} ever assigned to ${agent.name}.`,
  );

  const columns = byPerson
    ? ["profile_id", "person_name", "phone", "email", "currently_owned", "notes"]
    : [
        "lead_id",
        "profile_id",
        "person_name",
        "phone",
        "email",
        "product_id",
        "status_id",
        "current_agent",
        "currently_owned",
        "assigned_at",
        "lead_created_at",
        "notes",
      ];

  const csv = toCsv(rows, columns);

  const safeName = agent.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const defaultOut = `leads-ever-assigned-${safeName}.csv`;
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
