// Dev helper: run the follow-up reminder cron once, immediately.
// Usage:  node src/scripts/runFollowupCron.js
require("dotenv").config();
const runner = require("../cron/followup/runner");

(async () => {
  await runner();
  console.log("Follow-up cron tick complete.");
  process.exit(0);
})();
