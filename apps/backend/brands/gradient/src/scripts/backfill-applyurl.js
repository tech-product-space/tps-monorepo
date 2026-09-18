/**
 * Backfill: for jobs that have an empty applyUrl but a valid `link`, copy the
 * link into applyUrl. Apify-scraped LinkedIn jobs populate `link` (the job
 * posting URL) but leave applyUrl empty, which makes the public getAllJobs
 * filter hide them (it hides EXTERNAL jobs with no applyUrl).
 *
 *   node src/scripts/backfill-applyurl.js            # dry run, shows count
 *   node src/scripts/backfill-applyurl.js --confirm  # performs the update
 */

import db from "../database/postgres/models/index.js";
import { Op } from "sequelize";

const { jobsBoard, sequelize } = db;
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const where = {
    applyUrl: { [Op.or]: [null, ""] },
    link: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
  };

  const count = await jobsBoard.count({ where });
  console.log(`Jobs with empty applyUrl but a valid link: ${count}`);

  if (count === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing changed. Re-run with --confirm to apply.");
    return;
  }

  const [affected] = await sequelize.query(
    `UPDATE "jobsBoards"
        SET "applyUrl" = "link", "updatedAt" = NOW()
      WHERE ("applyUrl" IS NULL OR "applyUrl" = '')
        AND "link" IS NOT NULL AND "link" <> ''`
  );

  console.log(`\n✅ Backfilled applyUrl on ${affected.rowCount ?? count} jobs.`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
