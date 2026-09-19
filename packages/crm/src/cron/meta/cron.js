const psEnv = require("@ps/env/crm");
const cron = require("node-cron");
const metaService = require("../../services/meta.service");

/**
 * META_CRON_ENABLED is the master switch (registers the schedules at boot).
 * Runtime on/off is the DB flag meta_settings.poll_enabled, togglable from the
 * UI without a restart. Two jobs:
 *   • poll  — every 5 min, reads active forms from the DB (no /leadgen_forms).
 *   • sync  — hourly, refreshes the cached form list from Graph.
 */
if (psEnv["META_CRON_ENABLED"] === "true") {
  console.log("🟢 META Cron Enabled");

  // Poll leads every 5 minutes.
  cron.schedule("*/5 * * * *", async () => {
    try {
      await metaService.pollLeads();
    } catch (err) {
      console.error("Meta poll cron failed:", err.message);
    }
  });

  // Refresh the cached form list every hour.
  cron.schedule("0 * * * *", async () => {
    try {
      await metaService.syncAllEnabled();
    } catch (err) {
      console.error("Meta form-sync cron failed:", err.message);
    }
  });
} else {
  console.log("🔴 META Cron Disabled by ENV");
}
