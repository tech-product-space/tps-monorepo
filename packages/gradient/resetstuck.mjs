import { QueryTypes } from "sequelize";
import sequelize from "./src/database/postgres/sequelize.js";

/**
 * Clears the four backfills left on `running` by the argument-order bug.
 *
 * Their Agenda jobs died on the first tick, so nothing will ever finish them,
 * but the controller's 409 guard cannot tell that apart from a live import
 * until the one-hour stale window expires.
 */
const [before] = await sequelize.query(
  `SELECT COUNT(*)::int AS n FROM meta_forms WHERE "backfillStatus" = 'running'`,
  { type: QueryTypes.SELECT },
);

const [, meta] = await sequelize.query(
  `UPDATE meta_forms
      SET "backfillStatus" = 'error',
          "backfillError" = 'Backfill did not start — the job handler was misregistered. Fixed; please run it again.',
          "backfillFinishedAt" = NOW()
    WHERE "backfillStatus" = 'running'`,
);

console.log(`was running: ${before.n}, rows reset: ${meta.rowCount}`);

const rows = await sequelize.query(
  `SELECT name, "backfillStatus", "backfillError" FROM meta_forms WHERE "backfillError" IS NOT NULL`,
  { type: QueryTypes.SELECT },
);

console.log(JSON.stringify(rows, null, 1));
process.exit(0);
