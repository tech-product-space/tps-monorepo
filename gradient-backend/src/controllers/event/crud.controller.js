import db from "../../database/postgres/models/index.js";
const { Event, EventEmailTemplate, EventCertificateTemplate, sequelize } = db;

import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import toSlug from "../../util/helpers/slugHelpers.js";
import moment from "moment-timezone";
import {
  mergeEventSettings,
  resolveEventSettings,
} from "../../util/helpers/eventSettings.js";

export const createEvent = asyncWrapper(async (req, res) => {
  const { eventTitle, eventCategory, eventStartDate, eventEndDate, eventSlug, eventSubtitle } = req.body;

  // Basic validation
  if (!eventTitle || !eventCategory || !eventSlug || !eventStartDate || !eventEndDate) {
    return res.status(400).json({
      success: false,
      message: "Please fill all the Details",
    });
  }

  // Create event
  const event = await Event.create({
    eventTitle,
    eventCategory,
    eventSlug,
    eventSubtitle: eventSubtitle || "",
    eventStartDate,
    eventEndDate,
    isPublished: false,
    eventDetails: {},
  });

  return res.status(201).json({
    success: true,
    data: event,
  });
});

/**
 * Fields a duplicate inherits from its source.
 *
 * Listed explicitly rather than spread from the source row: identity
 * (title/slug/dates), publish state and the response window are supplied by the
 * caller or reset, and a field added to the model later should be a deliberate
 * decision here rather than silently copied.
 */
const DUPLICATED_EVENT_FIELDS = [
  "eventSubtitle",
  "eventStartTime",
  "eventEndTime",
  "speakers",
  "numberOfAttendees",
  "eventCreativeUrl",
  "eventType",
  "eventCategory",
  "ctaType",
  "location",
  "locationType",
  "tags",
  "eventDetails",
  "seo",
  "settings",
];

/**
 * Copy an event's content into a new one — the "run it again next quarter" case.
 *
 * The caller renames it and gives it new dates; everything that makes the page
 * (details, speakers, creative, SEO, settings) plus the email templates and
 * certificate template come across.
 *
 * Deliberately NOT copied: guests, feedback responses, issued certificates —
 * those belong to the run that happened — and reminders, which carry absolute
 * send times and sent state that would be wrong (and possibly overdue) against
 * new dates.
 */
export const duplicateEvent = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { eventTitle, eventSlug, eventStartDate, eventEndDate, isPublished } =
    req.body;

  if (!eventTitle || !eventSlug || !eventStartDate || !eventEndDate) {
    return res.status(400).json({
      success: false,
      message: "Title, slug, start date and end date are required",
    });
  }

  const source = await Event.findByPk(id);

  if (!source) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  const slug = toSlug(eventSlug);

  const slugTaken = await Event.findOne({
    where: { eventSlug: { [Op.iLike]: slug } },
  });

  if (slugTaken) {
    return res.status(409).json({
      success: false,
      message: "Slug already taken",
    });
  }

  const inherited = Object.fromEntries(
    DUPLICATED_EVENT_FIELDS.map((field) => [field, source[field]]),
  );

  // One transaction across three tables — a duplicate that got the event row
  // but not its templates would look complete and quietly be missing content.
  const event = await sequelize.transaction(async (t) => {
    const created = await Event.create(
      {
        ...inherited,
        eventTitle,
        eventSlug: slug,
        eventStartDate,
        eventEndDate,
        isPublished: isPublished === true,
        // The new run has not happened yet, whatever the source was left at.
        canAcceptResponse: false,
        scheduledAt: null,
      },
      { transaction: t },
    );

    const templates = await EventEmailTemplate.findAll({
      where: { eventId: source.id },
      transaction: t,
    });

    if (templates.length) {
      await EventEmailTemplate.bulkCreate(
        templates.map(({ type, subject, body }) => ({
          eventId: created.id,
          type,
          subject,
          body,
        })),
        { transaction: t },
      );
    }

    const certificateTemplate = await EventCertificateTemplate.findOne({
      where: { eventId: source.id },
      transaction: t,
    });

    if (certificateTemplate) {
      await EventCertificateTemplate.create(
        {
          eventId: created.id,
          name: certificateTemplate.name,
          // The S3 key is shared, not re-uploaded — the background art is the
          // same file, and nothing ever mutates an uploaded object in place.
          backgroundKey: certificateTemplate.backgroundKey,
          canvasWidth: certificateTemplate.canvasWidth,
          canvasHeight: certificateTemplate.canvasHeight,
          fields: certificateTemplate.fields,
          createdBy: req.admin?.id || null,
          updatedBy: req.admin?.id || null,
        },
        { transaction: t },
      );
    }

    return created;
  });

  req.activity?.set({
    entityLabel: event.eventTitle,
    metadata: { sourceEventId: source.id, sourceEventTitle: source.eventTitle },
  });

  return res.status(201).json({
    success: true,
    data: event,
  });
});

export const getAllEvents = asyncWrapper(async (req, res) => {

  const startOfToday = moment().tz("Asia/Kolkata").startOf("day").toDate();

  const events = await Event.findAll({
    attributes: [
      "id",
      "eventTitle",
      "eventSubtitle",
      // The list is where an event gets duplicated from, and the dialog seeds
      // the new slug off this one.
      "eventSlug",
      "eventStartDate",
      "eventEndDate",
      "eventStartTime",
      "eventEndTime",
      "eventCategory",
      "eventType",
      "isPublished",
      "createdAt",
      "updatedAt",
    ],
    where: {
      eventEndDate: {
        [Op.gte]: startOfToday,
      }
    },
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: events,
  });
});

export const getAllPastEvents = asyncWrapper(async (req, res) => {

  const startOfToday = moment().tz("Asia/Kolkata").startOf("day").toDate();

  const events = await Event.findAll({
    attributes: [
      "id",
      "eventTitle",
      "eventSubtitle",
      // The list is where an event gets duplicated from, and the dialog seeds
      // the new slug off this one.
      "eventSlug",
      "eventStartDate",
      "eventEndDate",
      "eventStartTime",
      "eventEndTime",
      "eventCategory",
      "eventType",
      "isPublished",
      "createdAt",
      "updatedAt",
    ],
    where: {
      eventEndDate: {
        [Op.lt]: startOfToday
      },
    },
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: events,
  });
});

export const deleteEvent = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Event id is required",
    });
  }

  const event = await Event.findByPk(id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  // Captured before the row goes — the log's automatic label lookup cannot help
  // once the record is deleted.
  req.activity?.set({ entityLabel: event.eventTitle });

  await event.destroy();

  return res.status(200).json({
    success: true,
    message: "Event deleted successfully",
  });
});

export const getEventById = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const event = await Event.findByPk(id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: event,
  });
});

export const updateEvent = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const event = await Event.findByPk(id);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  await event.update(req.body);

  return res.status(200).json({
    success: true,
    data: event,
  });
});

export const toggleEventPublishStatus = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const event = await Event.findByPk(id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  const newStatus = !event.isPublished;
  await event.update({ isPublished: newStatus });

  return res.status(200).json({
    success: true,
    message: `Event ${newStatus ? "published" : "unpublished"} successfully`,
    data: {
      id: event.id,
      isPublished: newStatus,
    },
  });
});

/**
 * Open or close the feedback window.
 *
 * This is the gate for everything on the public feedback route — the form, and
 * self-registration with it. Self-registration auto-approves, so keeping it
 * behind this flag is what stops the feedback link being used to jump a
 * Workshop waitlist before the event has happened.
 */
export const toggleEventAcceptResponse = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { canAcceptResponse } = req.body;

  const event = await Event.findByPk(id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  // Explicit value when given, otherwise flip — the admin toggle sends the
  // value it wants, but a bare POST from anywhere else should still work.
  const newStatus =
    typeof canAcceptResponse === "boolean"
      ? canAcceptResponse
      : !event.canAcceptResponse;

  await event.update({ canAcceptResponse: newStatus });

  return res.status(200).json({
    success: true,
    message: `Responses ${newStatus ? "opened" : "closed"} successfully`,
    data: {
      id: event.id,
      canAcceptResponse: newStatus,
    },
  });
});

/**
 * Update the feedback/certificate switches.
 *
 * Merges — a form posting one toggle must not blank the other three. Unknown
 * or non-boolean keys are dropped rather than persisted; see mergeEventSettings.
 */
export const updateEventSettings = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const event = await Event.findByPk(id);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  await event.update({ settings: mergeEventSettings(event, req.body) });

  return res.status(200).json({
    success: true,
    message: "Settings updated successfully",
    // Resolved, not raw — the caller wants to render every switch, including
    // the ones this event has never explicitly saved.
    data: resolveEventSettings(event),
  });
});

export const checkEventSlugAvailability = asyncWrapper(async (req, res) => {
  const rawSlug = req.query.slug?.trim();

  if (!rawSlug) {
    return res.status(400).json({
      result: "ERROR",
      error: "Slug is required",
    });
  }

  const slug = toSlug(rawSlug);

  const existing = await Event.findOne({
    where: { eventSlug: { [Op.iLike]: slug } },
  });

  if (existing) {
    return res.status(200).json({
      result: "SUCCESS",
      available: false,
      slug,
      message: "Slug already taken",
    });
  }

  return res.status(200).json({
    result: "SUCCESS",
    available: true,
    slug,
    message: "Slug is available",
  });
});

export const getAllPublishedEvents = asyncWrapper(async (req, res) => {

  const startOfToday = moment().tz("Asia/Kolkata").startOf("day").toDate();

  const events = await Event.findAll({
    attributes: [
      "eventTitle",
      "eventSubtitle",
      "eventStartDate",
      "eventEndDate",
      "eventStartTime",
      "eventEndTime",
      "speakers",
      "eventCreativeUrl",
      "eventType",
      "eventCategory",
      "ctaType",
      "location",
      "eventSlug"
    ],
    where: {
      isPublished: true,
      eventEndDate: {
        [Op.gte]: startOfToday,
      },
    },
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: events,
  });
});

export const getEventBySlug = asyncWrapper(async (req, res) => {
  const { slug } = req.params;

  const event = await Event.findOne({
    where: { eventSlug: slug },
    attributes: { exclude: ["location", "canAcceptResponse", "scheduledAt", "createdAt", "updatedAt"] }
  });

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Event not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: event,
  });
});
