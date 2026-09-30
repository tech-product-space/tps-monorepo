"use strict";

/**
 * One-time migration script — Facebook lead subsource backfill
 *
 * COURSE leads  (campaign_name IN course list)  → Facebook__Course
 * AI_COURSE leads (campaign_name IN ai list)    → Facebook__AI_Course
 * EVENTS leads  (everything else)               → Facebook__Events
 *
 * Run:
 *   node update-facebook-leads.js                     ← applies all three groups
 *   node update-facebook-leads.js --dry-run           ← preview only
 *   node update-facebook-leads.js --group=course      ← single group
 *   node update-facebook-leads.js --group=ai_course
 *   node update-facebook-leads.js --group=events
 */

require("dotenv").config();

const { sequelize, Lead } = require("../models");
const { Op } = require("sequelize");

// ── Configuration ────────────────────────────────────────────────────────────

const GROUPS = {
  course: {
    campaigns: ["LG_Testing_25/02/2026", "PM_LD_26/03/2026", "Testing_PM_IMAGE"],
    subsource_id:    "Facebook__Course",
    form_name:       "PM_LD_14022026",
    form_id:         "1271331784914951",
  },
  ai_course: {
    campaigns: ["Gen_AI - 17/03/2026", "Gen_AI - 09/03/2026"],
    subsource_id:    "Facebook__Gen_AI_Course",
    form_name:       "Gen_AI - 09/03/2026",
    form_id:         "1358467532986710",
  },
  // Events = every Facebook lead NOT in the two lists above
  events: {
    campaigns: null, // resolved dynamically as NOT IN (course + ai_course)
    subsource_id:    "Facebook__Events",
    form_name:       null, // don't touch extra_fields for events
    form_id:         null, // don't touch additional_data for events
  },
};

// All explicitly mapped campaign names — used to exclude from Events
const EXCLUDED_CAMPAIGNS = [
  ...GROUPS.course.campaigns,
  ...GROUPS.ai_course.campaigns,
  "SDE - 26/04/2026",
  "SDE - 26/04/26 (v1)",
];

const PRODUCT = "Facebook";

// ── CLI args ─────────────────────────────────────────────────────────────────

const isDryRun    = process.argv.includes("--dry-run");
const groupArg    = (process.argv.find((a) => a.startsWith("--group=")) || "").split("=")[1];
const groupsToRun = groupArg ? [groupArg] : Object.keys(GROUPS);

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildWhere(groupKey) {
  const base = { product_id: PRODUCT, is_deleted: false };

  if (groupKey === "events") {
    // Use a raw literal — Sequelize's Op.not + Op.contains on JSONB is unreliable.
    // extra_fields->>'campaign_name' NOT IN (...) also correctly handles NULLs
    // (NULL NOT IN → NULL → row excluded, which is fine for leads with no campaign).
    const inList = EXCLUDED_CAMPAIGNS.map((c) => `'${c.replace(/'/g, "''")}'`).join(", ");
    return {
      ...base,
      [Op.and]: [
        sequelize.literal(
          `(extra_fields->>'campaign_name') NOT IN (${inList})`,
        ),
      ],
    };
  }

  // For course / ai_course: match exact campaign names
  const { campaigns } = GROUPS[groupKey];
  return {
    ...base,
    [Op.or]: campaigns.map((name) => ({
      extra_fields: { [Op.contains]: { campaign_name: name } },
    })),
  };
}

// ── Per-group processor ───────────────────────────────────────────────────────

async function processGroup(groupKey) {
  const cfg = GROUPS[groupKey];
  console.log(`\n${"═".repeat(55)}`);
  console.log(`Group: ${groupKey.toUpperCase()} → subsource: ${cfg.subsource_id}`);
  console.log("═".repeat(55));

  const leads = await Lead.findAll({
    where: buildWhere(groupKey),
    attributes: ["id", "subsource_id", "extra_fields", "additional_data"],
  });

  console.log(`🔍  Matched: ${leads.length} lead(s)`);

  if (!leads.length) {
    console.log("   Nothing to update for this group.");
    return;
  }

  // Breakdown by campaign_name
  const tally = {};
  for (const lead of leads) {
    const cn = lead.extra_fields?.campaign_name ?? "(no campaign_name)";
    tally[cn] = (tally[cn] || 0) + 1;
  }
  console.log("   Breakdown by campaign_name:");
  Object.entries(tally).forEach(([k, v]) => console.log(`     ${k}: ${v}`));

  if (isDryRun) return; // stop here in dry-run

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  await sequelize.transaction(async (t) => {
    for (const lead of leads) {
      try {
        // Idempotency: skip if already fully patched
        const subsourceOk = lead.subsource_id === cfg.subsource_id;
        const formNameOk  = cfg.form_name === null || lead.extra_fields?.form_name  === cfg.form_name;
        const formIdOk    = cfg.form_id   === null || lead.additional_data?.form_id === cfg.form_id;

        if (subsourceOk && formNameOk && formIdOk) {
          skipped++;
          continue;
        }

        const updatePayload = { subsource_id: cfg.subsource_id };

        // Only touch extra_fields / additional_data when values are provided
        if (cfg.form_name !== null) {
          updatePayload.extra_fields = {
            ...(lead.extra_fields || {}),
            form_name: cfg.form_name,
          };
        }

        if (cfg.form_id !== null) {
          updatePayload.additional_data = {
            ...(lead.additional_data || {}),
            form_id: cfg.form_id,
          };
        }

        await lead.update(updatePayload, { transaction: t });
        updated++;
      } catch (err) {
        errors++;
        console.error(`  ❌  lead ${lead.id}: ${err.message}`);
        throw err; // rolls back transaction
      }
    }
  });

  console.log(`   ✅  Updated : ${updated}`);
  console.log(`   ⏭️   Skipped : ${skipped}`);
  if (errors) console.log(`   ❌  Errors  : ${errors}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  try {
    await sequelize.authenticate();
    console.log("✅  DB connected");

    if (isDryRun) console.log("⚠️   DRY-RUN mode — no changes will be written");

    for (const groupKey of groupsToRun) {
      if (!GROUPS[groupKey]) {
        console.error(`Unknown group "${groupKey}". Valid: ${Object.keys(GROUPS).join(", ")}`);
        process.exit(1);
      }
      await processGroup(groupKey);
    }

    console.log(`\n${"═".repeat(55)}`);
    console.log("Done.");
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  }
}

run();