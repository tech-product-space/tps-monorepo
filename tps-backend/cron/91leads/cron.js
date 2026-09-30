const cron = require("node-cron");
const { run91Leads } = require("./runner");

if (process.env['91LEADS_CRON_ENABLED'] === "true") {
  console.log("🟢 91 Leads Cron Enabled");
  // Run every hour
  // cron.schedule("0 * * * *", run91Leads);
  // Run every 30 min
  cron.schedule("*/30 * * * *", run91Leads);
  // Test For 1min
  // cron.schedule("*/60 * * * * *", run91Leads);
} else {
  console.log("🔴 91 Leads Cron Disabled by ENV");
}
