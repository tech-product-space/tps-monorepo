const psEnv = require("@ps/env/tps");
const cron = require("node-cron");
const { runPlatformLeadsSync } = require("./PlatformLeads/runner");

if (psEnv.AIRTABLE_CRON_ENABLED === "true") {
  console.log("🟢 Airtable Cron Enabled");
  // Run every hour
  cron.schedule("0 * * * *", runPlatformLeadsSync);
  // Run every 30 min
  // cron.schedule("*/30 * * * *", runPlatformLeadsSync);
  // Test For 1min
  // cron.schedule("*/60 * * * * *", runPlatformLeadsSync);
} else {
  console.log("🔴 Airtable Cron Disabled by ENV");
}
