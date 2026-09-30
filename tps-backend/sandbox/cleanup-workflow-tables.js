/**
 * One-time cleanup: drops any partial workflow domain tables left by a
 * failed migration. Safe to run multiple times (uses IF EXISTS).
 *
 * Usage:  node sandbox/cleanup-workflow-tables.js
 */

const sequelize = require("../config/db");

const TABLES = [
  "workflow_node_runs",
  "workflow_enrollments",
  "workflow_versions",
  "workflows",
  "lead_consent",
];

(async () => {
  try {
    for (const t of TABLES) {
      await sequelize.query(`DROP TABLE IF EXISTS "${t}" CASCADE;`);
      console.log(`dropped ${t} (if it existed)`);
    }

    // remove any partial entries from SequelizeMeta so the migrations can re-run
    const filenames = [
      "20260514120000-create-workflows.js",
      "20260514120100-create-workflow-versions.js",
      "20260514120200-create-workflow-enrollments.js",
      "20260514120300-create-workflow-node-runs.js",
      "20260514120400-create-lead-consent.js",
    ];
    for (const f of filenames) {
      await sequelize.query(
        `DELETE FROM "SequelizeMeta" WHERE name = :name;`,
        { replacements: { name: f } }
      );
    }
    console.log("SequelizeMeta cleared for workflow migrations");

    console.log("\ncleanup complete — now run: npx sequelize-cli db:migrate");
    process.exit(0);
  } catch (err) {
    console.error("cleanup failed:", err.message);
    process.exit(1);
  }
})();
