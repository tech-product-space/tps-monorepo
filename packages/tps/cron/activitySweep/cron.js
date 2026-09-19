const psEnv = require("@ps/env/tps");
const cron = require("node-cron");
const { runActivitySweep } = require("./runner");

// Gated on the same switch as everything else that talks to the CRM.
if (psEnv.CRM_WEBSITE_VISIT_ENABLED === "true") {
  console.log("🟢 Activity Sweep Cron Enabled");
  // Hourly, at ten past — deliberately off the hour so it does not collide with
  // the existing visit catch-up.
  cron.schedule("10 * * * *", runActivitySweep);
} else {
  console.log("🔴 Activity Sweep Cron Disabled by ENV");
}
