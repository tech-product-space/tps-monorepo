import agenda from "../config/agenda.js";

import db from "../database/postgres/models/index.js";
const { EventReminder, EventGuest, User } = db;

import {
  EVENT_REMINDER_ATTENDEE_TYPE,
  EVENT_REMINDER_STATUS,
  EVENT_REMINDER_TARGET_STATUS,
} from "../config/constants/eventReminder.js";

import capitalizeName from "../util/helpers/capitalizeName.js";

import {
  BODIES,
  buildEmail,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../services/email/index.js";
import logger from "../util/logger.js";

const JOB_NAME = "send-event-email-reminder";
const MAX_RETRIES = 3;
const RETRY_DELAY = "in 30 seconds";

/**
 * Emails go out one at a time, so a large guest list easily outlives Agenda's
 * 10-minute default lock and the job gets picked up again mid-send. It doubles
 * as the window after which a template stuck on PROCESSING is treated as
 * abandoned (the process died mid-send and nothing will ever finish it).
 */
const LOCK_LIFETIME = 60 * 60 * 1000;

/**
 * Define Agenda Job
 */
export default function eventReminderJob() {
  agenda.define(
    JOB_NAME,
    async (job) => {
      const { templateId } = job.attrs.data;

      logger.info("Event reminder job started", { templateId });

      try {
        const template = await EventReminder.findByPk(templateId);

        if (!template) {
          logger.warn("Reminder template not found", { templateId });
          return;
        }

        if (template.status === EVENT_REMINDER_STATUS.SENT) {
          logger.info("Reminder already sent", { templateId });
          return;
        }

        /* -------------------------------
           Guard Against A Concurrent Run
        ------------------------------- */

        if (template.status === EVENT_REMINDER_STATUS.PROCESSING) {
          const startedAt = template.updatedAt?.getTime() ?? 0;

          if (Date.now() - startedAt < LOCK_LIFETIME) {
            logger.info("Reminder already running", { templateId });
            return;
          }

          logger.warn("Reclaiming stale processing reminder", {
            templateId,
            startedAt: template.updatedAt,
          });
        }

        /* -------------------------------
           Mark Processing
        ------------------------------- */

        template.status = EVENT_REMINDER_STATUS.PROCESSING;
        template.totalSent = 0;
        template.totalFailed = 0;
        await template.save();

        logger.info("Reminder marked as PROCESSING", { templateId });

        /* -------------------------------
           Build Guest Query
        ------------------------------- */

        const whereClause = {
          eventId: template.eventId,
        };

        // A null/empty target means "no filter". Assigning it to the where
        // clause would compile to `status IS NULL` and match nobody.
        if (
          template.targetStatus &&
          template.targetStatus !== EVENT_REMINDER_TARGET_STATUS.ALL
        ) {
          whereClause.status = template.targetStatus;
        }

        if (
          template.targetAttendeeType &&
          template.targetAttendeeType !== EVENT_REMINDER_ATTENDEE_TYPE.ALL
        ) {
          whereClause.attendeeType = template.targetAttendeeType;
        }

        /* -------------------------------
           Fetch Guests
        ------------------------------- */

        const guests = await EventGuest.findAll({
          where: whereClause,
        });

        logger.info("Guests fetched", { count: guests.length });

        if (!guests.length) {
          logger.warn("No guests found for reminder", { templateId });

          template.status = EVENT_REMINDER_STATUS.FAILED;
          await template.save();

          return;
        }

        /* -------------------------------
           Send Emails
        ------------------------------- */

        let totalSent = 0;
        let totalFailed = 0;

        const alreadyEmailed = new Set();

        for (const guest of guests) {
          const email = guest.email?.trim();

          if (!email) {
            logger.warn("Guest email missing", { guestId: guest.id });
            continue;
          }

          // The same person can register twice; without this they get two
          // copies of every reminder.
          const emailKey = email.toLowerCase();

          if (alreadyEmailed.has(emailKey)) {
            logger.info("Duplicate guest email skipped", {
              guestId: guest.id,
            });
            continue;
          }

          alreadyEmailed.add(emailKey);

          const recipientName = capitalizeName(
            guest.name || "Guest",
          );

          const subject = BODIES.CUSTOM(template.subject, {
            name: recipientName,
          });

          const html = buildEmail({
            body: BODIES.CUSTOM(template.body, { name: recipientName }),
            header: HEADERS.GRADIENT,
            footer: FOOTERS.GRADIENT,
          });

          const result = await sendMail({
            fromEmail: template.senderEmail,
            to: email,
            subject,
            html,
          });

          if (result.success) {
            totalSent++;
            logger.info("Reminder email sent", { email });
          } else {
            totalFailed++;
            logger.error("Reminder email failed", { email, error: result.error });
          }
        }

        logger.info("Reminder emails completed", { totalSent, totalFailed });

        /* -------------------------------
           Record The Outcome
        ------------------------------- */

        // `sendMail` never throws — it resolves `{ success: false }`, including
        // when the sender has no registered provider. Reporting SENT off the
        // back of a run where nothing left the building is how a dead reminder
        // looks healthy in the panel.
        template.status =
          totalSent > 0
            ? EVENT_REMINDER_STATUS.SENT
            : EVENT_REMINDER_STATUS.FAILED;

        template.totalSent = totalSent;
        template.totalFailed = totalFailed;
        template.sentAt = new Date();

        await template.save();

        logger.info("Reminder job completed", { templateId });
      } catch (error) {
        logger.error("Reminder job failed", {
          templateId,
          error: error.message,
        });

        // Agenda increments failCount after this handler rejects, so this is
        // the count of *previous* failures.
        const attempts = job.attrs.failCount || 0;
        const willRetry = attempts < MAX_RETRIES;

        // Release the PROCESSING lock either way. Left set, the retry (and
        // every later run) returns early at the guard above, and the template
        // sits on `processing` for good.
        try {
          await EventReminder.update(
            {
              status: willRetry
                ? EVENT_REMINDER_STATUS.PENDING
                : EVENT_REMINDER_STATUS.FAILED,
            },
            { where: { id: templateId } },
          );
        } catch (statusError) {
          logger.error("Failed to reset reminder status", {
            templateId,
            error: statusError.message,
          });
        }

        if (willRetry) {
          logger.warn("Retrying reminder job", {
            templateId,
            attempt: attempts + 1,
          });

          job.schedule(RETRY_DELAY);
          await job.save();
        } else {
          logger.error("Reminder job permanently failed", { templateId });
        }

        throw error;
      }
    },
    { lockLifetime: LOCK_LIFETIME },
  );
}

/**
 * `data.templateId` dot-notation is a MongoDB idiom. The Postgres backend's
 * filter builder only understands id/ids/name/names/notNames/data and silently
 * drops anything else — so the dotted form cancelled *every* reminder job for
 * every event. `data` compiles to a `data @> '{...}'::jsonb` containment check,
 * which is the one this needs.
 */
export const cancelEventReminder = async (templateId) => {
  return agenda.cancel({
    name: JOB_NAME,
    data: { templateId },
  });
};

export const scheduleEventReminder = async (templateId, scheduledAt) => {
  await cancelEventReminder(templateId);

  return agenda.schedule(new Date(scheduledAt), JOB_NAME, { templateId });
};

export const sendEventReminderNow = async (templateId) => {
  await cancelEventReminder(templateId);

  return agenda.now(JOB_NAME, { templateId });
};
