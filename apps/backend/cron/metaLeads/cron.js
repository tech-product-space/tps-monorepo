const cron = require("node-cron");
const { runMetaLeadsCronSync } = require("./runner");

if (process.env.META_LEADS_CRON_ENABLED === "true") {
  console.log("🟢 Meta Leads Cron Enabled");
  // Run every 10 min
  cron.schedule("*/10 * * * *", runMetaLeadsCronSync);
  // Test For 1min
  // cron.schedule("*/60 * * * * *", runMetaLeadsCronSync);
} else {
  console.log("🔴 Meta Leads Cron Disabled by ENV");
}
