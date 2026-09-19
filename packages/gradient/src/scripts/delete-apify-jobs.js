/**
 * One-time utility: bulk-delete every job synced from Apify
 * (uploadedBy === "apify"). Admin-created jobs (uploadedBy === "admin") are
 * left untouched.
 *
 * Safety: DRY-RUN by default. It prints how many Apify jobs exist but deletes
 * nothing. Pass --confirm to actually delete.
 *
 *   node src/scripts/delete-apify-jobs.js            # dry run, shows count
 *   node src/scripts/delete-apify-jobs.js --confirm  # performs the delete
 *
 * The DB it touches comes from gradient-backend/.env (POSTGRES_HOST/DB/...).
 * Make sure that points at the database you intend before using --confirm.
 */

import db from "../database/postgres/models/index.js";

const { jobsBoard, sequelize } = db;

const CONFIRM = process.argv.includes("--confirm");
const SOURCE = "apify";

async function main() {
  const jobCount = await jobsBoard.count({ where: { uploadedBy: SOURCE } });
  console.log(`Apify jobs (uploadedBy = "${SOURCE}"): ${jobCount}`);

  if (jobCount === 0) {
    console.log("Nothing to delete.");
    return;
  }

  if (!CONFIRM) {
    console.log(
      "\nDRY RUN — nothing deleted. Re-run with --confirm to delete these jobs."
    );
    return;
  }

  const deleted = await jobsBoard.destroy({ where: { uploadedBy: SOURCE } });
  console.log(`\n✅ Deleted ${deleted} Apify jobs.`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
