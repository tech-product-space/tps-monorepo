const {
  Event,
  EmailTemplate,
  CertificateTemplate,
  sequelize,
} = require("../../models");
const { isValidSlug } = require("../../utils/slugHelpers");

// Columns that must never be carried over from the source row
const SKIPPED_EVENT_FIELDS = ["id", "createdAt", "updatedAt"];

class DuplicateEventError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Duplicates an event and its reusable configuration.
 *
 * Copied: the whole Event row (including the `eventDetails` landing page JSON),
 * the enrollment/status email templates and the certificate template.
 * Not copied: guests (and therefore their feedback + issued certificates),
 * reminder emails (v1 `EventEmailReminders` and v2 `EventEmailTemplates`),
 * referral codes and registrations.
 */
exports.duplicateEvent = async (sourceId, overrides = {}) => {
  const {
    eventTitle,
    eventSlug,
    eventStartDate,
    eventEndDate,
    eventStartTime,
    eventEndTime,
    isPublished,
  } = overrides;

  const source = await Event.findByPk(sourceId);
  if (!source) {
    throw new DuplicateEventError(404, "Event not found");
  }

  if (!eventSlug) {
    throw new DuplicateEventError(400, "Event URL (slug) is required");
  }

  if (!isValidSlug(eventSlug)) {
    throw new DuplicateEventError(
      400,
      "Invalid slug format. Use only lowercase letters, numbers, and hyphens."
    );
  }

  const existingSlug = await Event.findOne({ where: { eventSlug } });
  if (existingSlug) {
    throw new DuplicateEventError(
      409,
      "Event slug already in use. Please choose a different one."
    );
  }

  if (!eventStartDate || !eventEndDate) {
    throw new DuplicateEventError(400, "Start date and end date are required");
  }

  if (new Date(eventEndDate) < new Date(eventStartDate)) {
    throw new DuplicateEventError(400, "End date cannot be before start date");
  }

  const sourceData = source.toJSON();
  const clonedFields = {};
  for (const key of Object.keys(sourceData)) {
    if (!SKIPPED_EVENT_FIELDS.includes(key)) {
      clonedFields[key] = sourceData[key];
    }
  }

  return sequelize.transaction(async (transaction) => {
    const newEvent = await Event.create(
      {
        ...clonedFields,
        eventTitle: eventTitle || source.eventTitle,
        eventSlug,
        eventStartDate,
        eventEndDate,
        eventStartTime: eventStartTime ?? source.eventStartTime,
        eventEndTime: eventEndTime ?? source.eventEndTime,
        isPublished: Boolean(isPublished),
      },
      { transaction }
    );

    // Enrollment / status email templates (Pending, Approved, Registered, ...).
    // Their date + times drive the calendar invite, so they follow the new dates.
    const emailTemplates = await EmailTemplate.findAll({
      where: { eventId: source.id },
      transaction,
    });

    if (emailTemplates.length) {
      await EmailTemplate.bulkCreate(
        emailTemplates.map((template) => {
          const { id, createdAt, updatedAt, ...rest } = template.toJSON();
          return {
            ...rest,
            eventId: newEvent.id,
            date: template.date ? eventStartDate : template.date,
            startTime: template.startTime
              ? eventStartTime ?? template.startTime
              : template.startTime,
            endTime: template.endTime
              ? eventEndTime ?? template.endTime
              : template.endTime,
          };
        }),
        { transaction }
      );
    }

    const certificateTemplate = await CertificateTemplate.findOne({
      where: { eventId: source.id },
      transaction,
    });

    if (certificateTemplate) {
      const { id, createdAt, updatedAt, ...rest } = certificateTemplate.toJSON();
      await CertificateTemplate.create(
        { ...rest, eventId: newEvent.id },
        { transaction }
      );
    }

    return {
      newEvent,
      copied: {
        emailTemplates: emailTemplates.length,
        certificateTemplate: certificateTemplate ? 1 : 0,
      },
    };
  });
};

exports.DuplicateEventError = DuplicateEventError;
