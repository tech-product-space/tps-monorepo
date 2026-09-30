import db from "../../database/postgres/models/index.js";
import env from "../../config/env.js";
import { FREE_COURSE_CERTIFICATE_STATUS } from "../../config/constants/freeCourseCertificate.js";
import { issueFreeCourseCertificate } from "../../services/freeCourse/certificateIssue.service.js";

const { FreeCourseCertificate } = db;

/**
 * Wait until a course's certificates have finished rendering — under either
 * queue mode.
 *
 * Issuing is fire-and-forget by design, and *how* it happens depends on
 * `AGENDA_JOBS_ENABLED`:
 *
 *   off  the enqueue runs the issue service inline, so waiting is enough
 *   on   the enqueue writes a row to `agenda_jobs`, which only a running
 *        worker drains — and a test process is not one
 *
 * In the second case this runs the job body itself, which is all the worker
 * does. Deliberately not `agenda.start()`: that would make the test a worker
 * for the *whole* queue and start firing unrelated jobs, including real
 * reminder emails.
 *
 * Returns false on timeout rather than throwing, so the caller can report it as
 * a failed assertion with the statuses attached.
 */
export const settleFreeCourseCertificates = async (
  courseId,
  { timeoutMs = 60000 } = {},
) => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (env.agendaEnabled) {
      const queued = await FreeCourseCertificate.findAll({
        where: {
          freeCourseId: courseId,
          status: FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
        },
        attributes: ["id"],
      });

      for (const row of queued) {
        await issueFreeCourseCertificate(row.id);
      }
    }

    const unsettled = await FreeCourseCertificate.count({
      where: {
        freeCourseId: courseId,
        status: [
          FREE_COURSE_CERTIFICATE_STATUS.APPROVED,
          FREE_COURSE_CERTIFICATE_STATUS.ISSUING,
        ],
      },
    });

    if (unsettled === 0) return true;
    if (Date.now() > deadline) return false;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};
