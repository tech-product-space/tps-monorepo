const cron = require("node-cron");
const runner = require("./runner");

if (process.env["MEETING_CRON_ENABLED"] === "true") {
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
