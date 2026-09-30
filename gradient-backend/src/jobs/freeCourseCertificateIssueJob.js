import agenda from "../config/agenda.js";
import env from "../config/env.js";
import logger from "../util/logger.js";
import { issueFreeCourseCertificate } from "../services/freeCourse/certificateIssue.service.js";

const JOB_NAME = "issue-free-course-certificate";

// Rendering is CPU-bound (canvas) and then network-bound (S3, SMTP). A handful
// at a time keeps a bulk generate moving without pinning the box.
const CONCURRENCY = 3;

export default function freeCourseCertificateIssueJob() {
  // Argument order is (name, processor, options). Agenda v4 moved options from
  // second to third, and getting it wrong is silent: the queue accepts jobs,
  // picks each one up, and fails it instantly with "definition.fn is not a
  // function", stranding every certificate on Approved. That is a real outage
  // this repo has already had — see test/agendaJobs.test.js.
  agenda.define(
    JOB_NAME,
    async (job) => {
      const { certificateId } = job.attrs.data;

      // issueFreeCourseCertificate owns the whole state machine, including
      // refusing to run on a row that is not Approved or Failed — so a
      // duplicate or replayed job is a no-op rather than a second certificate.
      const result = await issueFreeCourseCertificate(certificateId);

      if (result?.skipped) {
        logger.info("Free course certificate issue skipped", {
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
 * Inline is deliberately fire-and-forget rather than awaited: the caller is an
 * HTTP handler and marking a lesson complete must not wait on a render, an S3
 * upload and an SMTP round trip. Errors are already recorded on the row by
 * issueFreeCourseCertificate, so there is nothing here for a caller to handle.
 */
export const enqueueFreeCourseCertificateIssue = async (certificateId) => {
  if (env.agendaEnabled) {
    await agenda.now(JOB_NAME, { certificateId });
    return { queued: true };
  }

  setImmediate(() => {
    issueFreeCourseCertificate(certificateId).catch((error) =>
      logger.error("Inline free course certificate issue threw", {
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
 * would otherwise start every render at once and exhaust memory on a bulk
 * generate. The per-job concurrency cap above does the parallelism.
 */
export const enqueueFreeCourseCertificateIssues = async (certificateIds) => {
  for (const certificateId of certificateIds) {
    await enqueueFreeCourseCertificateIssue(certificateId);
  }

  return { count: certificateIds.length, queued: env.agendaEnabled };
};
