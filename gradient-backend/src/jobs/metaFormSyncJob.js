import agenda from "../config/agenda.js";
import env from "../config/env.js";
import { META_FORM_SYNC_INTERVAL } from "../config/constants/metaLead.js";
import { syncAllEnabled } from "../services/meta/metaAccount.service.js";
import logger from "../util/logger.js";

/**
 * Refreshes the cached lead-form list once an hour.
 *
 * This is the only scheduled caller of `/leadgen_forms`. Keeping it out of the
 * poll is the design: a form list changes a few times a year, and reading it
 * every five minutes would be one wasted request per account per cycle,
 * forever.
 *
 * **Syncing never creates leads.** It writes `name`, `status` and `lastSeenAt`
 * and nothing else, so an admin's routing can never be reverted by a background
 * job.
 */

const JOB_NAME = "sync-meta-forms";

const LOCK_LIFETIME = 10 * 60 * 1000;

export default function metaFormSyncJob() {
  // Argument order is (name, processor, options) — Agenda v4 moved options from
  // second to third. With the old order `definition.fn` is the options object
  // and every tick dies with "definition.fn is not a function", which is silent
  // apart from a row in agenda_jobs. See certificateIssueJob.js, same bug.
  agenda.define(
    JOB_NAME,
    async () => {
      // syncAllEnabled collects per-account failures rather than throwing, so
      // one dead token cannot stop the other accounts syncing.
      const results = await syncAllEnabled();

      const failed = results.filter((result) => result.error);

      if (failed.length) {
        logger.warn("Meta form sync finished with errors", {
          accounts: results.length,
          failed: failed.length,
        });
      }
    },
    { lockLifetime: LOCK_LIFETIME, concurrency: 1 },
  );

  if (!env.meta.enabled) {
    logger.info(
      "Meta form sync job defined but not scheduled (META_INTEGRATION_ENABLED is off)",
    );
    return;
  }

  agenda.on("ready", async () => {
    await agenda.every(META_FORM_SYNC_INTERVAL, JOB_NAME);
    logger.info("Meta form sync job scheduled", {
      interval: META_FORM_SYNC_INTERVAL,
    });
  });
}
