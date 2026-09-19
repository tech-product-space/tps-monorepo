import db from "../../database/postgres/models/index.js";
const { EventReminder, Event, AdminUser } = db;

import {
  EVENT_REMINDER_ATTENDEE_TYPE,
  EVENT_REMINDER_STATUS,
  EVENT_REMINDER_TARGET_STATUS,
} from "../../config/constants/eventReminder.js";
import {
  cancelEventReminder,
  scheduleEventReminder,
  sendEventReminderNow,
} from "../../jobs/eventReminderJob.js";
import { BODIES, buildEmail, EMAIL_PROVIDER_ID, FOOTERS, HEADERS, sendMail } from "../../services/email/index.js";

import asyncWrapper from "../../util/helpers/asyncWrapper.js";

/**
 * The panel's selects post "" when the admin leaves them on the placeholder.
 * Stored as-is that fails the model's isIn validator, and stored as null the
 * job would compile it into `status IS NULL` and match no guests — so an unset
 * target means "everyone".
 */
const normaliseTarget = (value, fallback) => {
  const target = typeof value === "string" ? value.trim() : value;

  return target ? target : fallback;
};

/** Fields a client is allowed to write. `status`, `sentAt` and the send counts
 *  are owned by the job — a stray body field must not be able to mark a
 *  reminder as sent. */
const EDITABLE_FIELDS = [
  "name",
  "subject",
  "body",
  "senderEmail",
  "targetStatus",
  "targetAttendeeType",
];

/**
 * CREATE EVENT REMINDER
 */
export const createReminder = asyncWrapper(async (req, res) => {
  const {
    eventId,
    name,
    subject,
    body,
    senderEmail,
    targetStatus,
    targetAttendeeType,
  } = req.body;

  const adminId = req.admin?.id || null;

  if (!eventId || !name || !subject || !body || !senderEmail) {
    return res.status(400).json({
      message: "Required fields are missing",
    });
  }

  //validate sender email
  if (!Object.values(EMAIL_PROVIDER_ID).includes(senderEmail)) {
    return res.status(400).json({
      message: "Invalid 'senderEmail'",
    });
  }

  const event = await Event.findByPk(eventId);

  if (!event) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  const reminder = await EventReminder.create({
    eventId,
    name,
    subject,
    body,
    senderEmail,
    targetStatus: normaliseTarget(targetStatus, EVENT_REMINDER_TARGET_STATUS.ALL),
    targetAttendeeType: normaliseTarget(
      targetAttendeeType,
      EVENT_REMINDER_ATTENDEE_TYPE.ALL,
    ),
    createdBy: adminId,
  });

  return res.status(201).json({
    message: "Event reminder created",
    data: reminder,
  });
});

/**
 * UPDATE EVENT REMINDER
 */
export const updateReminder = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const adminId = req.admin?.id || null;

  const reminder = await EventReminder.findByPk(id);

  if (!reminder) {
    return res.status(404).json({
      message: "Reminder not found",
    });
  }

  if (reminder.status === EVENT_REMINDER_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Cannot edit reminder while sending",
    });
  }

  const updates = { updatedBy: adminId };

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] === undefined) continue;

    updates[field] = field.startsWith("target")
      ? normaliseTarget(
          req.body[field],
          field === "targetStatus"
            ? EVENT_REMINDER_TARGET_STATUS.ALL
            : EVENT_REMINDER_ATTENDEE_TYPE.ALL,
        )
      : req.body[field];
  }

  await reminder.update(updates);

  return res.json({
    message: "Reminder updated successfully",
    data: reminder,
  });
});

/**
 * LIST REMINDERS
 */
export const listReminders = asyncWrapper(async (req, res) => {
  const { eventId, status } = req.query;

  const where = {};

  if (eventId) where.eventId = eventId;
  if (status) where.status = status;

  const eventReminders = await EventReminder.findAll({
    where,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: AdminUser,
        as: "createdAdmin",
        attributes: ["id", "name", "email"],
      },
      {
        model: AdminUser,
        as: "updatedAdmin",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  return res.json(eventReminders);
});

/**
 * DELETE REMINDER
 */
export const removeReminder = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const reminder = await EventReminder.findByPk(id);

  if (!reminder) {
    return res.status(404).json({
      message: "Reminder not found",
    });
  }

  if (reminder.status === EVENT_REMINDER_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Cannot delete reminder while sending",
    });
  }

  // Otherwise the queued job outlives the template and wakes up to a row that
  // is no longer there.
  await cancelEventReminder(reminder.id);

  // The activity log's label lookup cannot run once the row is gone.
  req.activity?.set({ entityLabel: reminder.name });

  await reminder.destroy();

  return res.json({
    message: "Reminder deleted successfully",
  });
});

export const cancelReminder = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const adminId = req.admin?.id || null;

  const reminder = await EventReminder.findByPk(id);

  if (!reminder) {
    return res.status(404).json({
      message: "Reminder not found",
    });
  }

  if (reminder.status === EVENT_REMINDER_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Cannot cancel reminder while sending",
    });
  }

  await cancelEventReminder(reminder.id);

  reminder.status = EVENT_REMINDER_STATUS.PENDING;
  reminder.scheduledAt = null;
  reminder.updatedBy = adminId;

  await reminder.save();

  return res.json({
    message: "Reminder cancelled successfully",
  });
});

export const scheduleReminder = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { scheduledAt } = req.body;
  const adminId = req.admin?.id || null;

  const reminder = await EventReminder.findByPk(id);

  if (!reminder) {
    return res.status(404).json({
      message: "Reminder not found",
    });
  }

  if (!scheduledAt) {
    return res.status(400).json({
      message: "scheduledAt is required",
    });
  }

  const runAt = new Date(scheduledAt);

  if (Number.isNaN(runAt.getTime())) {
    return res.status(400).json({
      message: "'scheduledAt' is not a valid date",
    });
  }

  if (reminder.status === EVENT_REMINDER_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Reminder is currently processing",
    });
  }

  await scheduleEventReminder(reminder.id, runAt);

  reminder.scheduledAt = runAt;
  // Not PENDING: a scheduled reminder and one that was never scheduled read
  // identically in the panel otherwise.
  reminder.status = EVENT_REMINDER_STATUS.SCHEDULED;
  reminder.updatedBy = adminId;

  await reminder.save();

  return res.json({
    message: "Reminder scheduled successfully",
    data: reminder,
  });
});

export const sendReminderNow = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const adminId = req.admin?.id || null;

  const reminder = await EventReminder.findByPk(id);

  if (!reminder) {
    return res.status(404).json({
      message: "Reminder not found",
    });
  }

  if (reminder.status === EVENT_REMINDER_STATUS.SENT) {
    return res.status(400).json({
      message: "Reminder already sent",
    });
  }

  if (reminder.status === EVENT_REMINDER_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Reminder is currently processing",
    });
  }

  await sendEventReminderNow(reminder.id);

  // Clear any earlier SCHEDULED/FAILED state — the queued run owns this
  // template now, and the panel should not still be showing the last outcome.
  reminder.status = EVENT_REMINDER_STATUS.PENDING;
  reminder.updatedBy = adminId;

  await reminder.save();

  return res.json({
    message: "Reminder job triggered successfully",
  });
});

/**
 * SEND TEST EMAIL FROM REMINDER TEMPLATE
 */
export const sendTestMailFromReminder = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { recipientName, to } = req.body;

  if (!recipientName || !to) {
    return res.status(400).json({
      message: "recipient name, reminderId and 'to' are required",
    });
  }

  const reminder = await EventReminder.findByPk(id);

  if (!reminder) {
    return res.status(404).json({
      message: "Reminder not found",
    });
  }

  const subject = BODIES.CUSTOM(reminder.subject, { name: recipientName });

  const html = buildEmail({
    body: BODIES.CUSTOM(reminder.body, { name: recipientName }),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  const result = await sendMail({
    fromEmail: reminder.senderEmail,
    to,
    subject,
    html: html,
    text: reminder.body,
  });

  if (!result.success) {
    return res.status(500).json({
      message: "Failed to send test email",
      error: result.error,
    });
  }

  return res.status(200).json({
    message: "Test email sent successfully"
  })
});