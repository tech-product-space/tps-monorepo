const psEnv = require("@ps/env/crm");
/**
 * Backfill the PARTIAL bucket: profiles where exactly ONE agent is present and
 * the remaining leads are unassigned. The blanks are filled with that agent.
 *
 * Deliberately does NOT touch the CONFLICT bucket (2+ distinct agents) — that
 * needs a human decision about who owns the person, not a heuristic.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. Every write goes through the same
 * cascade + Activity trail the app uses, so the audit log reads the same as a
 * manual reassignment.
 *
 * Runs against DATABASE_URL from .env. The DB name is printed and, on --apply,
 * confirmed before any write — check it, because this one writes.
 *
 *   node src/scripts/fixAgentSplit.js                      # preview
 *   node src/scripts/fixAgentSplit.js --apply              # write
 *   node src/scripts/fixAgentSplit.js --apply --limit=50   # write in batches
 */
require("dotenv").config();

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const actorArg = process.argv.find((a) => a.startsWith("--actor="));

const { Lead, User, sequelize } = require("../models");
const { cascadeAgentToProfileLeads } = require("../services/lead.service");

// Exactly one distinct agent, and at least one lead without it.
const PARTIAL_SQL = `
SELECT
  l.profile_id,
  MAX(l.agent_id::text)                        AS agent_id,
  COUNT(*)                                     AS lead_count,
  COUNT(*) - COUNT(l.agent_id)                 AS unassigned_count
FROM leads l
WHERE l.is_deleted = false
GROUP BY l.profile_id
HAVING COUNT(DISTINCT l.agent_id) = 1
   AND COUNT(*) <> COUNT(l.agent_id)
ORDER BY COUNT(*) DESC
`;

(async () => {
  try {
    const dbName = (psEnv.DATABASE_URL || "").split("/").pop();
    console.log(`\nDB: ${dbName}`);
    if (!dbName) throw new Error("No DATABASE_URL set in .env");

    // Writing requires naming the target DB on the command line. Cheap, but it
    // is the difference between rehearsing on beta and rewriting 1,649 live
    // leads because .env was pointed somewhere else an hour ago.
    if (APPLY) {
      const confirmArg = process.argv.find((a) => a.startsWith("--confirm-db="));
      const named = confirmArg ? confirmArg.split("=")[1] : null;
      if (named !== dbName) {
        console.error(
          `Refusing to write. DATABASE_URL points at "${dbName}".`,
        );
        console.error(`Re-run with --confirm-db=${dbName} if that is really the target.`);
        process.exitCode = 1;
        return;
      }
    }

    console.log(APPLY ? "MODE: APPLY (writing)" : "MODE: DRY RUN (no writes)");
    console.log("=".repeat(60));

    let rows = (await sequelize.query(PARTIAL_SQL))[0];
    if (LIMIT) rows = rows.slice(0, LIMIT);

    const agentIds = [...new Set(rows.map((r) => r.agent_id))];
    const agents = await User.findAll({
      where: { id: agentIds },
      attributes: ["id", "name"],
    });
    const agentName = Object.fromEntries(
      agents.map((a) => [a.id.toString(), a.name]),
    );

    // Attribute the backfill to a real user when one is named, so the Activity
    // rows have an actor instead of a null. Falls back to null (system).
    let actorId = null;
    if (actorArg) {
      const who = actorArg.split("=")[1];
      const actor = await User.findOne({ where: { email: who } });
      if (!actor) throw new Error(`--actor user not found: ${who}`);
      actorId = actor.id;
      console.log(`Actor: ${actor.name} <${who}>`);
    }

    const totalLeads = rows.reduce((n, r) => n + Number(r.unassigned_count), 0);
    console.log(`Profiles to fix : ${rows.length}`);
    console.log(`Leads to fill   : ${totalLeads}\n`);

    // Per-agent preview — how many leads each agent gains. Worth eyeballing
    // before applying: a lopsided number usually means a bad migration, not a
    // real book of business.
    const gain = {};
    for (const r of rows) {
      const k = agentName[r.agent_id] || r.agent_id;
      gain[k] = (gain[k] || 0) + Number(r.unassigned_count);
    }
    console.log("Leads gained per agent:");
    for (const [name, n] of Object.entries(gain).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(name).padEnd(24)} +${n}`);
    }

    if (!APPLY) {
      console.log("\nDry run only. Re-run with --apply to write.\n");
      return;
    }

    let done = 0;
    let failed = 0;
    for (const r of rows) {
      const t = await sequelize.transaction();
      try {
        await cascadeAgentToProfileLeads(
          r.profile_id,
          r.agent_id,
          actorId,
          t,
          "Migration",
          "Backfill: profile had one agent and unassigned sibling leads",
        );
        await t.commit();
        done += 1;
        if (done % 100 === 0) console.log(`  ...${done}/${rows.length}`);
      } catch (e) {
        await t.rollback();
        failed += 1;
        console.error(`  FAILED profile ${r.profile_id}: ${e.message}`);
      }
    }

    console.log(`\nDone. Profiles fixed: ${done}, failed: ${failed}`);

    const [[check]] = await sequelize.query(`
      SELECT COUNT(*) AS still_split FROM (
        SELECT profile_id FROM leads WHERE is_deleted = false
        GROUP BY profile_id
        HAVING COUNT(DISTINCT agent_id) = 1 AND COUNT(*) <> COUNT(agent_id)
      ) x
    `);
    console.log(`PARTIAL profiles remaining: ${check.still_split}\n`);
  } catch (e) {
    console.error("Fix failed:", e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
