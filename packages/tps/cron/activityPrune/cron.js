const cron = require("node-cron");
const { runActivityPrune, RETENTION_DAYS } = require("./runner");

// Housekeeping only — it runs whether or not the CRM sync is switched on,
// because anonymous rows accumulate regardless of where they are being sent.
console.log(`🟢 Activity Prune Cron Enabled (${RETENTION_DAYS} day retention)`);

// 03:40, well clear of the hourly sweep and of anything else on the hour.
cron.schedule("40 3 * * *", runActivityPrune);
