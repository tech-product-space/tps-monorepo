const psEnv = require("@ps/env/crm");
const cron = require("node-cron");
const runner = require("./runner");

if (psEnv["MEETING_CRON_ENABLED"] === "true") {
  console.log("🟢 Meeting Reminder Cron Enabled");

  cron.schedule("* * * * *", async () => {
    try {
      await runner();
    } catch (err) {
      console.error("Meeting cron failed:", err.message);
    }
  });
} else {
  console.log("🔴 Meeting Reminder Cron Disabled by ENV");
}
