const cron = require("node-cron");
const runner = require("./runner");

if (process.env["BOOKING_CRON_ENABLED"] === "true") {
  console.log("🟢 Booking Reminder Cron Enabled");

  cron.schedule("* * * * *", async () => {
    try {
      await runner();
    } catch (err) {
      console.error("Booking cron failed:", err.message);
    }
  });
} else {
  console.log("🔴 Booking Reminder Cron Disabled by ENV");
}
