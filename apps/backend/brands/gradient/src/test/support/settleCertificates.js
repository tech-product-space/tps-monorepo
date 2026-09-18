import db from "../../database/postgres/models/index.js";
import env from "../../config/env.js";
import { EVENT_CERTIFICATE_STATUS } from "../../config/constants/eventCertificate.js";
import { issueCertificate } from "../../services/event/certificateIssue.service.js";

const { EventCertificate } = db;

/**
 * Wait until an event's certificates have finished rendering — under either
 * queue mode.
 *
 * Issuing is fire-and-forget by design, and *how* it happens depends on
 * `AGENDA_JOBS_ENABLED`:
 *
 *   off  the enqueue runs `issueCertificate` inline, so waiting is enough
 *   on   the enqueue writes a row to `agenda_jobs`, which only a running
 *        worker drains — and a test process is not one
 *
 * In the second case this runs the job body itself, which is all the worker
 * does (`jobs/certificateIssueJob.js`). Deliberately not `agenda.start()`: that
 * would make the test a worker for the *whole* queue and start firing unrelated
 * jobs, including real reminder emails.
 *
 * Returns false on timeout rather than throwing, so the caller can report it as
 * a failed assertion with the statuses attached.
 */
/**
 * The same thing for one row that was explicitly re-queued — a retry, say.
 *
 * `settleCertificates` only drives rows sitting on `Approved`; a retried row is
 * `Failed` until the worker claims it, so it needs naming directly.
 */
export const settleCertificate = async (certificateId, { timeoutMs = 60000 } = {}) => {
  if (env.agendaEnabled) {
    await issueCertificate(certificateId);
    return true;
  }

  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const row = await EventCertificate.findByPk(certificateId, {
      attributes: ["status"],
    });

    if (
      !row ||
      ![
        EVENT_CERTIFICATE_STATUS.APPROVED,
        EVENT_CERTIFICATE_STATUS.ISSUING,
        EVENT_CERTIFICATE_STATUS.FAILED,
      ].includes(row.status)
    ) {
      return true;
    }

    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

export const settleCertificates = async (eventId, { timeoutMs = 60000 } = {}) => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (env.agendaEnabled) {
      const queued = await EventCertificate.findAll({
        where: { eventId, status: EVENT_CERTIFICATE_STATUS.APPROVED },
        attributes: ["id"],
      });

      for (const row of queued) {
        await issueCertificate(row.id);
      }
    }

    const unsettled = await EventCertificate.count({
      where: {
        eventId,
        status: [
          EVENT_CERTIFICATE_STATUS.APPROVED,
          EVENT_CERTIFICATE_STATUS.ISSUING,
        ],
      },
    });

    if (unsettled === 0) return true;
    if (Date.now() > deadline) return false;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};
