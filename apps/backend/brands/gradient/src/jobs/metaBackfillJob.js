import agenda from "../config/agenda.js";
import db from "../database/postgres/models/index.js";
import {
  META_BACKFILL_LOCK_LIFETIME,
  META_BACKFILL_STATUS,
} from "../config/constants/metaLead.js";
import { runBackfill } from "../services/meta/metaIngestion.service.js";
import logger from "../util/logger.js";

const { MetaAccount, MetaForm } = db;

/**
 * Imports one form's entire lead history, on demand.
 *
 * An Agenda job rather than a detached in-process promise, which is what the
 * CRM this was ported from does. Theirs leaves a form stuck on `running`
 * forever when the process restarts mid-import — a failure state their own
 * troubleshooting guide documents and cannot fix except by starting again.
 * Here the row is reclaimable (see `isStale`) and the job survives a deploy.
 *
 * Triggered by `POST /meta/forms/:formId/backfill`; never scheduled.
 */

const JOB_NAME = "backfill-meta-form";

/**
 * A backfill still marked `running` past the lock lifetime is abandoned — the
 * process that owned it died and nothing will ever finish it.
 *
 * Without this, a single crash makes the form permanently un-backfillable: the
 * 409 guard sees `running` and refuses every retry.
 */
export const isStale = (form) => {
  if (form.backfillStatus !== META_BACKFILL_STATUS.RUNNING) return false;
  if (!form.backfillStartedAt) return true;

  const age = Date.now() - new Date(form.backfillStartedAt).getTime();

  return age > META_BACKFILL_LOCK_LIFETIME;
};

export default function metaBackfillJob() {
  // Argument order is (name, processor, options) — Agenda v4 moved options from
  // second to third. With the old order `definition.fn` is the options object
  // and every tick dies with "definition.fn is not a function", which is silent
  // apart from a row in agenda_jobs. See certificateIssueJob.js, same bug.
  agenda.define(
    JOB_NAME,
    async (job) => {
      const { formRowId, since } = job.attrs.data || {};

      const form = await MetaForm.findByPk(formRowId);

      if (!form) {
        logger.warn("Meta backfill job: form no longer exists", { formRowId });
        return;
      }

      const account = await MetaAccount.findByPk(form.accountId);

      if (!account) {
        form.backfillStatus = META_BACKFILL_STATUS.ERROR;
        form.backfillError = "The Facebook account for this form no longer exists.";
        form.backfillFinishedAt = new Date();
        await form.save();
        return;
      }

      logger.info("Meta backfill started", {
        formId: form.formId,
        since: since || "all time",
      });

      // runBackfill captures its own failures onto the form row — it resolves
      // rather than throws, so Agenda's retry does not fight the status column.
      await runBackfill(account, form, since ? new Date(since) : null);
    },
    { lockLifetime: META_BACKFILL_LOCK_LIFETIME, concurrency: 1 },
  );

  /**
   * Write a job-level failure back onto the form.
   *
   * `runBackfill` catches its own errors, so the only things that reach here
   * are failures *around* the work — a bad job definition, a database drop, an
   * OOM. Without this the form sits on `running` with an empty error until the
   * stale window expires an hour later, and the panel shows a progress spinner
   * for a job that is already dead. That is exactly how the argument-order bug
   * above stayed invisible.
   */
  agenda.on(`fail:${JOB_NAME}`, async (error, job) => {
    const { formRowId } = job.attrs.data || {};

    logger.error("Meta backfill job failed", {
      formRowId,
      error: error?.message,
    });

    if (!formRowId) return;

    try {
      await MetaForm.update(
        {
          backfillStatus: META_BACKFILL_STATUS.ERROR,
          backfillError: `Backfill failed: ${error?.message || "unknown error"}`,
          backfillFinishedAt: new Date(),
        },
        // Only if it is still running — a later successful retry must not be
        // overwritten by a late failure event from the attempt before it.
        {
          where: {
            id: formRowId,
            backfillStatus: META_BACKFILL_STATUS.RUNNING,
          },
        },
      );
    } catch (updateError) {
      logger.error("Could not record the backfill failure", {
        formRowId,
        error: updateError.message,
      });
    }
  });
}

/**
 * Queue a backfill. Called by the controller, which owns the 409 guard.
 *
 * Unscheduled jobs run as soon as a worker is free, so this returns
 * immediately and the panel watches the form row for progress.
 */
export const queueBackfill = async (formRowId, since = null) => {
  await agenda.now(JOB_NAME, { formRowId, since });
};
