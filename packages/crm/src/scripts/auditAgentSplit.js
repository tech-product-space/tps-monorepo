const psEnv = require("@ps/env/crm");
/**
 * READ-ONLY audit: find lead_profiles whose leads disagree about who owns them.
 *
 * Ownership is meant to be per-PERSON — every lead under one profile should
 * carry the same agent. Manual migration left that invariant broken. This
 * script only SELECTs; it never writes. Fixing is fixAgentSplit.js.
 *
 * Buckets:
 *   PARTIAL  — exactly one distinct agent + one or more unassigned leads.
 *              Unambiguous: fill the blanks with that agent.
 *   CONFLICT — two or more distinct agents. Needs a winner rule.
 *
 * Runs against DATABASE_URL from .env — whichever DB that points at. The name
 * is printed at the top of every run, so check it before trusting the numbers.
 *
 * Usage:
 *   node src/scripts/auditAgentSplit.js
 *   node src/scripts/auditAgentSplit.js --detail
 *   node src/scripts/auditAgentSplit.js --csv=temp/split_profiles.csv --detail-csv=temp/conflict_leads.csv
 */
require("dotenv").config();
const fs = require("fs");
const { Sequelize } = require("sequelize");

const url = psEnv.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL set in .env");
  process.exit(1);
}

const sequelize = new Sequelize(url, {
  dialect: "postgres",
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
});

// One row per split profile. `agents` is the distinct set of assigned agents
// (nulls excluded); `unassigned_count` is counted separately so PARTIAL and
// CONFLICT can be told apart. Enrollment owner is pulled in because a paid
// enrollment is the strongest claim to a person and settles most conflicts.
const SUMMARY_SQL = `
WITH per_profile AS (
  SELECT
    l.profile_id,
    COUNT(*)                                            AS lead_count,
    COUNT(l.agent_id)                                   AS assigned_count,
    COUNT(*) - COUNT(l.agent_id)                        AS unassigned_count,
    COUNT(DISTINCT l.agent_id)                          AS distinct_agents,
    ARRAY_AGG(DISTINCT l.agent_id) FILTER (WHERE l.agent_id IS NOT NULL) AS agent_ids
  FROM leads l
  WHERE l.is_deleted = false
  GROUP BY l.profile_id
  HAVING COUNT(DISTINCT l.agent_id) > 1
      OR (COUNT(DISTINCT l.agent_id) = 1 AND COUNT(*) <> COUNT(l.agent_id))
)
SELECT
  p.profile_id,
  p.lead_count,
  p.assigned_count,
  p.unassigned_count,
  p.distinct_agents,
  p.agent_ids,
  CASE WHEN p.distinct_agents = 1 THEN 'PARTIAL' ELSE 'CONFLICT' END AS bucket,
  prof.name,
  prof.phone,
  (SELECT COUNT(*) FROM lead_courses lc
     WHERE lc.lead_profile_id = p.profile_id)            AS enrollment_count,
  (SELECT COUNT(DISTINCT lc.owner_agent_id) FROM lead_courses lc
     WHERE lc.lead_profile_id = p.profile_id
       AND lc.owner_agent_id IS NOT NULL)                AS distinct_enrollment_owners
FROM per_profile p
JOIN lead_profiles prof ON prof.id = p.profile_id
ORDER BY p.distinct_agents DESC, p.lead_count DESC;
`;

const TOTALS_SQL = `
SELECT
  (SELECT COUNT(*) FROM lead_profiles)                                    AS profiles_total,
  (SELECT COUNT(*) FROM leads WHERE is_deleted = false)                   AS leads_total,
  (SELECT COUNT(*) FROM leads WHERE is_deleted = false
     AND agent_id IS NULL)                                                AS leads_unassigned,
  (SELECT COUNT(DISTINCT profile_id) FROM leads WHERE is_deleted = false) AS profiles_with_leads;
`;


// Per-lead detail for the CONFLICT pile. This is the human-review worklist:
// every signal that could pick a winner, side by side.
const CONFLICT_DETAIL_SQL = `
WITH split AS (
  SELECT l.profile_id
  FROM leads l
  WHERE l.is_deleted = false
  GROUP BY l.profile_id
  HAVING COUNT(DISTINCT l.agent_id) > 1
)
SELECT
  prof.name, prof.phone, l.profile_id, l.id AS lead_id,
  l.product_id, l.status_id,
  l.agent_id, u.name AS agent_name,
  l.assigned_at, l.lead_update_date, l.created_at,
  (SELECT COUNT(*) FROM activities a WHERE a.lead_id = l.id) AS activity_count,
  (SELECT COUNT(*) FROM lead_courses lc
     WHERE lc.lead_profile_id = l.profile_id) AS profile_enrollments,
  (SELECT STRING_AGG(DISTINCT uo.name, '|') FROM lead_courses lc
     JOIN users uo ON uo.id = lc.owner_agent_id
     WHERE lc.lead_profile_id = l.profile_id) AS enrollment_owners
FROM leads l
JOIN split s          ON s.profile_id = l.profile_id
JOIN lead_profiles prof ON prof.id = l.profile_id
LEFT JOIN users u     ON u.id = l.agent_id
WHERE l.is_deleted = false
ORDER BY prof.name, l.assigned_at DESC NULLS LAST, l.lead_update_date DESC;
`;

(async () => {
  try {
    await sequelize.authenticate();
    const dbName = url.split("/").pop();
    console.log(`\nDB: ${dbName}\n${"=".repeat(60)}`);

    const [[totals]] = await sequelize.query(TOTALS_SQL);
    const rows = (await sequelize.query(SUMMARY_SQL))[0];

    const partial = rows.filter((r) => r.bucket === "PARTIAL");
    const conflict = rows.filter((r) => r.bucket === "CONFLICT");
    const leadsIn = (rs) => rs.reduce((n, r) => n + Number(r.lead_count), 0);

    console.log(`Profiles total            : ${totals.profiles_total}`);
    console.log(`  ...with >=1 live lead   : ${totals.profiles_with_leads}`);
    console.log(`Live leads                : ${totals.leads_total}`);
    console.log(`  ...unassigned           : ${totals.leads_unassigned}`);
    console.log(`\nSPLIT PROFILES            : ${rows.length}`);
    console.log(`  PARTIAL  (1 agent+gaps) : ${partial.length}  (${leadsIn(partial)} leads)`);
    console.log(`  CONFLICT (2+ agents)    : ${conflict.length}  (${leadsIn(conflict)} leads)`);

    const fillable = partial.reduce((n, r) => n + Number(r.unassigned_count), 0);
    console.log(`\nLeads auto-fillable from PARTIAL: ${fillable}`);

    // Conflicts where a paid enrollment names exactly one owner can still be
    // settled automatically; the rest are the genuine manual-review pile.
    const settleable = conflict.filter(
      (r) => Number(r.distinct_enrollment_owners) === 1,
    );
    console.log(`CONFLICT settleable by enrollment owner: ${settleable.length}`);
    console.log(`CONFLICT needing manual review        : ${conflict.length - settleable.length}`);

    if (conflict.length) {
      console.log(`\n--- CONFLICT sample (first 15) ---`);
      for (const r of conflict.slice(0, 15)) {
        console.log(
          `  ${r.name || "(no name)"} | ${r.phone || "-"} | ${r.lead_count} leads | ` +
            `${r.distinct_agents} agents | ${r.unassigned_count} unassigned | ` +
            `enrollments=${r.enrollment_count} owners=${r.distinct_enrollment_owners}`,
        );
      }
    }

    if (partial.length) {
      console.log(`\n--- PARTIAL sample (first 10) ---`);
      for (const r of partial.slice(0, 10)) {
        console.log(
          `  ${r.name || "(no name)"} | ${r.phone || "-"} | ${r.assigned_count} assigned + ` +
            `${r.unassigned_count} unassigned`,
        );
      }
    }

    if (process.argv.includes("--detail")) {
      const detail = (await sequelize.query(CONFLICT_DETAIL_SQL))[0];
      console.log(`
--- CONFLICT per-lead detail (${detail.length} leads) ---`);
      let last = null;
      for (const d of detail) {
        if (d.profile_id !== last) {
          console.log(
            `
${d.name || "(no name)"} | ${d.phone || "-"} | enrollments=${d.profile_enrollments}` +
              (d.enrollment_owners ? ` | enrolled_by=${d.enrollment_owners}` : ""),
          );
          last = d.profile_id;
        }
        const at = d.assigned_at ? new Date(d.assigned_at).toISOString().slice(0, 10) : "  never   ";
        const up = d.lead_update_date ? new Date(d.lead_update_date).toISOString().slice(0, 10) : "-";
        console.log(
          `    ${(d.product_id || "-").padEnd(22)} ${(d.agent_name || "UNASSIGNED").padEnd(18)}` +
            ` assigned=${at} updated=${up} acts=${d.activity_count} status=${d.status_id}`,
        );
      }
      const detailCsv = process.argv.find((a) => a.startsWith("--detail-csv="));
      if (detailCsv) {
        const path = detailCsv.split("=")[1];
        const cols = Object.keys(detail[0] || {});
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        fs.writeFileSync(
          path,
          [cols.join(","), ...detail.map((r) => cols.map((c) => esc(r[c])).join(","))].join(String.fromCharCode(10)),
        );
        console.log(`
Detail CSV written: ${path}`);
      }
    }

    const csvArg = process.argv.find((a) => a.startsWith("--csv="));
    if (csvArg) {
      const path = csvArg.split("=")[1];
      const head =
        "bucket,profile_id,name,phone,lead_count,assigned_count,unassigned_count,distinct_agents,agent_ids,enrollment_count,distinct_enrollment_owners";
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const body = rows.map((r) =>
        [
          r.bucket, r.profile_id, r.name, r.phone, r.lead_count,
          r.assigned_count, r.unassigned_count, r.distinct_agents,
          (r.agent_ids || []).join("|"), r.enrollment_count,
          r.distinct_enrollment_owners,
        ].map(esc).join(","),
      );
      fs.writeFileSync(path, [head, ...body].join("\n"));
      console.log(`\nCSV written: ${path} (${rows.length} rows)`);
    }

    console.log("");
  } catch (e) {
    console.error("Audit failed:", e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
