/**
 * One-time utility: bulk-delete every job whose title does NOT match
 * "*data*analyst*" (case-insensitive, "data" appearing somewhere before
 * "analyst"). Jobs with a NULL/empty title are treated as non-matching and
 * are deleted too.
 *
 * Matches (kept):    "Data Analyst", "Senior Data Analyst II",
 *                    "Data Science Analyst", "data & business analyst"
 * Non-matches (deleted): "Analyst - DACI Analytics", "Data Engineer",
 *                    "Analyst, Data" (analyst comes before data)
 *
 * Safety: DRY-RUN by default. It prints what would be removed but deletes
 * nothing. Pass --confirm to actually delete.
 *
 *   node src/scripts/delete-non-data-analyst-jobs.js            # dry run
 *   node src/scripts/delete-non-data-analyst-jobs.js --confirm  # deletes
 *
 * Extra flags:
 *   --keep-internal   leave jobSource = "INTERNAL" (admin-created) jobs alone
 *   --limit=N         cap how many sample titles are printed (default 25)
 *
 * The DB it touches comes from gradient-backend/.env (POSTGRES_HOST/DB/...).
 * Make sure that points at the database you intend before using --confirm.
 */

import { Op } from "sequelize";
import db from "../database/postgres/models/index.js";

const { jobsBoard, sequelize } = db;

const CONFIRM = process.argv.includes("--confirm");
const KEEP_INTERNAL = process.argv.includes("--keep-internal");
const SAMPLE_LIMIT =
  parseInt(
    process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1],
    10
  ) || 25;

const PATTERN = "%data%analyst%";

// Titles NOT matching *data*analyst* — NULL titles included.
const where = {
  [Op.and]: [
    {
      [Op.or]: [
        { title: null },
        { title: { [Op.notILike]: PATTERN } },
      ],
    },
    ...(KEEP_INTERNAL ? [{ jobSource: { [Op.ne]: "INTERNAL" } }] : []),
  ],
};

async function main() {
  const total = await jobsBoard.count();
  const doomed = await jobsBoard.count({ where });

  console.log(`Total jobs:            ${total}`);
  console.log(`Matching "${PATTERN}": ${total - doomed} (kept)`);
  console.log(`To delete:             ${doomed}`);
  if (KEEP_INTERNAL) console.log('(--keep-internal: INTERNAL jobs excluded)');

  if (doomed === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const sample = await jobsBoard.findAll({
    where,
    attributes: ["id", "title", "companyName", "jobSource"],
    order: [["postedAt", "DESC"]],
    limit: SAMPLE_LIMIT,
  });

  console.log(`\nSample of rows to delete (first ${sample.length}):`);
  for (const job of sample) {
    console.log(
      `  [${job.jobSource}] ${job.title ?? "(no title)"} — ${
        job.companyName ?? "(no company)"
      }`
    );
  }
  if (doomed > sample.length) {
    console.log(`  ... and ${doomed - sample.length} more`);
  }

  if (!CONFIRM) {
    console.log(
      "\nDRY RUN — nothing deleted. Re-run with --confirm to delete these jobs."
    );
    return;
  }

  const deleted = await jobsBoard.destroy({ where });
  console.log(`\n✅ Deleted ${deleted} jobs.`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
