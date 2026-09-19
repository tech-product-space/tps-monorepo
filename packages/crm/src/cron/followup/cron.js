const psEnv = require("@ps/env/crm");
const cron = require("node-cron");
const runner = require("./runner");

if (psEnv["FOLLOWUP_CRON_ENABLED"] === "true") {
  console.log("🟢 Follow-up Reminder Cron Enabled");

  cron.schedule("* * * * *", async () => {
    try {
      await runner();
    } catch (err) {
      console.error("Follow-up cron failed:", err.message);
    }
  });
} else {
  console.log("🔴 Follow-up Reminder Cron Disabled by ENV");
}
