const psEnv = require("@ps/env/tps");
const cron = require("node-cron");
const { runCrmVisitSync } = require("./runner");

// Gated on the same switch as the live send — if visits are not going to the CRM
// at all, the catch-up has nothing to catch up on.
if (psEnv.CRM_WEBSITE_VISIT_ENABLED === "true") {
  console.log("🟢 CRM Visit Sync Cron Enabled");
  // Hourly, on the hour.
  cron.schedule("0 * * * *", runCrmVisitSync);
} else {
  console.log("🔴 CRM Visit Sync Cron Disabled by ENV");
}
