import agenda from "../config/agenda.js";
import env from "../config/env.js";
import { META_POLL_INTERVAL } from "../config/constants/metaLead.js";
import { pollLeads } from "../services/meta/metaIngestion.service.js";
import logger from "../util/logger.js";

/**
 * Pulls new Facebook leads every five minutes.
 *
 * Two switches gate this, and they answer different questions:
 *
 *   • `META_INTEGRATION_ENABLED` — read here, at boot. Off means the schedule
 *     is never registered, so there is no Graph traffic at all.
 *   • `meta_settings.pollEnabled` — read inside `pollLeads`, every run. Off
 *     means the job wakes, finds the flag and returns. That is what lets an
 *     operator stop ingestion from the panel at 11pm without a deploy.
 */

const JOB_NAME = "poll-meta-leads";

/**
 * The run is a sequence of Graph calls, one per active form, and 15s each in
 * the worst case. Ten minutes is comfortably past any realistic cycle while
 * still being well short of Agenda picking the job up twice.
 */
const LOCK_LIFETIME = 10 * 60 * 1000;

export default function metaPollJob() {
  // Argument order is (name, processor, options) — Agenda v4 moved options from
  // second to third. With the old order `definition.fn` is the options object
  // and every tick dies with "definition.fn is not a function", which is silent
  // apart from a row in agenda_jobs. See certificateIssueJob.js, same bug.
  agenda.define(
    JOB_NAME,
    async () => {
      try {
        const result = await pollLeads();

        if (result.skipped) {
          logger.info("Meta poll job skipped", { reason: result.reason });
        }
      } catch (error) {
        // pollLeads already isolates per-form failures, so reaching here means
        // something structural — the database, or the settings read.
        logger.error("Meta poll job failed", { error: error.message });
        throw error;
      }
    },
    { lockLifetime: LOCK_LIFETIME, concurrency: 1 },
  );

  if (!env.meta.enabled) {
    logger.info("Meta poll job defined but not scheduled (META_INTEGRATION_ENABLED is off)");
    return;
  }

  agenda.on("ready", async () => {
    // `every` is idempotent on the job name — a restart re-uses the existing
    // schedule rather than stacking a second one.
    await agenda.every(META_POLL_INTERVAL, JOB_NAME);
    logger.info("Meta poll job scheduled", { interval: META_POLL_INTERVAL });
  });
}
