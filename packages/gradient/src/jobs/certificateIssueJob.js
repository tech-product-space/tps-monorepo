import agenda from "../config/agenda.js";
import env from "../config/env.js";
import logger from "../util/logger.js";
import { issueCertificate } from "../services/event/certificateIssue.service.js";

const JOB_NAME = "issue-event-certificate";

// Rendering is CPU-bound (canvas) and then network-bound (S3, SMTP). A handful
// at a time keeps a 200-recipient event moving without pinning the box.
const CONCURRENCY = 3;

export default function certificateIssueJob() {
  // Argument order is (name, processor, options). Agenda v4 moved options from
  // second to third and this file had the old order, so `definition.fn` was the
  // options object: every job failed on its first tick with "definition.fn is
  // not a function", leaving its certificate stranded on Approved. The other two
  // jobs in this folder pass no options, which is why only this one broke.
  agenda.define(
    JOB_NAME,
    async (job) => {
      const { certificateId } = job.attrs.data;

      // issueCertificate owns the whole state machine, including refusing to run
      // on a row that is not Approved or Failed — so a duplicate or replayed job
      // is a no-op rather than a second certificate.
      const result = await issueCertificate(certificateId);

      if (result?.skipped) {
        logger.info("Certificate issue skipped", {
          certificateId,
          reason: result.skipped,
        });
      }
    },
    { concurrency: CONCURRENCY },
  );
}

/**
 * Queue a certificate for issuing.
 *
 * With `AGENDA_JOBS_ENABLED=false` — the normal local setup — jobs are defined
 * but never run, which would leave the entire feature dead in development. So
 * fall back to doing the work inline.
 *
 * Inline is deliberately fire-and-forget rather than awaited: callers are HTTP
 * handlers and a feedback submission must not wait on a render, an S3 upload
 * and an SMTP round trip. Errors are already recorded on the row by
 * issueCertificate, so there is nothing here for a caller to handle.
 */
export const enqueueCertificateIssue = async (certificateId) => {
  if (env.agendaEnabled) {
    await agenda.now(JOB_NAME, { certificateId });
    return { queued: true };
  }

  setImmediate(() => {
    issueCertificate(certificateId).catch((error) =>
      logger.error("Inline certificate issue threw", {
        certificateId,
        error: error.message,
      }),
    );
  });

  return { queued: false, inline: true };
};

/**
 * Queue many, in order.
 *
 * Sequential on purpose: `agenda.now` is a database write each, and inline mode
 * would otherwise start every render at once and exhaust memory on a large
 * event. The per-job concurrency cap above does the parallelism.
 */
export const enqueueCertificateIssues = async (certificateIds) => {
  for (const certificateId of certificateIds) {
    await enqueueCertificateIssue(certificateId);
  }

  return { count: certificateIds.length, queued: env.agendaEnabled };
};
