"use strict";

const cron = require("node-cron");
const {
  reconcileOnce,
} = require("../service/workflow/reconcile/reconcileEnrollments");

const SCHEDULE = process.env.WORKFLOW_RECONCILE_CRON || "*/5 * * * *";

let running = false;

cron.schedule(SCHEDULE, async () => {
  if (running) {
    // Skip overlap — previous run still in progress
    return;
  }
  running = true;
  try {
    const result = await reconcileOnce();
    if (result.scanned > 0 || process.env.DEBUG_WORKFLOW === "1") {
      console.log(
        `[reconcile] scanned=${result.scanned} requeued=${result.requeued} skipped=${result.skipped}`
      );
    }
  } catch (err) {
    console.error("[reconcile] error:", err.message);
  } finally {
    running = false;
  }
});

console.log(`[reconcile] cron scheduled: ${SCHEDULE}`);
