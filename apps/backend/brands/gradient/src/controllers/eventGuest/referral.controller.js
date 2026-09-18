import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { EventGuest, Event, User, EventEmailTemplate } = db;

import { EVENT_GUEST_STATUS } from "../../config/constants/eventGuest.js";
import { EVENT_EMAIL_TEMPLATE_TYPE } from "../../config/constants/event.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import {
  BODIES,
  buildEmail,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../../services/email/index.js";
import capitalizeName from "../../util/helpers/capitalizeName.js";
import { generateEventIcsContent } from "../../util/ics.js";

/**
 * Everything the logged-in user's referral page needs for one event, in a
 * single call: their registration, their code, how many people they have
 * brought in, and who referred them.
 *
 * GET /events/guest/referral/summary?eventSlug=
 */
export const getMyReferralSummary = asyncWrapper(async (req, res) => {
  const { eventSlug } = req.query;
  const userId = req.user?.id;

  if (!eventSlug) {
    return res.status(400).json({ message: "eventSlug is required" });
  }

  const event = await Event.findOne({
    where: { eventSlug },
    attributes: [
      "id",
      "eventTitle",
      "eventSlug",
      "eventType",
      "eventCategory",
      "eventStartDate",
      "eventEndDate",
    ],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const guest = await EventGuest.findOne({
    where: { eventId: event.id, userId },
    attributes: [
      "id",
      "name",
      "email",
      "phone",
      "countryCode",
      "attendeeType",
      "status",
      "referrerUserId",
    ],
  });

  if (!guest) {
    return res.status(403).json({
      message: "You are not registered for this event",
    });
  }

  const user = await User.findByPk(userId, {
    attributes: ["id", "fullName", "email", "referralCode"],
  });

  const totalReferrals = await EventGuest.count({
    where: { eventId: event.id, referrerUserId: userId },
  });

  let referredBy = null;

  if (guest.referrerUserId) {
    const referrer = await User.findByPk(guest.referrerUserId, {
      attributes: ["id", "fullName"],
    });

    if (referrer) {
      referredBy = { name: referrer.fullName };
    }
  }

  return res.status(200).json({
    data: {
      event: {
        id: event.id,
        title: event.eventTitle,
        slug: event.eventSlug,
        eventType: event.eventType,
        eventCategory: event.eventCategory,
      },
      registration: {
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        countryCode: guest.countryCode,
        attendeeType: guest.attendeeType,
        status: guest.status,
      },
      referral: {
        code: user?.referralCode ?? null,
        totalReferrals,
      },
      referredBy,
    },
  });
});

/**
 * Every event this user has referred anyone to, with a count each.
 *
 * `getMyReferralSummary` is deliberately per-event and 403s for an event the
 * user is not registered for, which makes it the wrong shape for a dashboard —
 * asking it about each of someone's events in turn is N requests, most of them
 * errors. This answers the dashboard's question directly, in one grouped query.
 *
 * GET /events/guest/referral/mine
 */
export const getMyReferralOverview = asyncWrapper(async (req, res) => {
  const userId = req.user?.id;

  const user = await User.findByPk(userId, {
    attributes: ["id", "referralCode"],
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const rows = await EventGuest.findAll({
    where: { referrerUserId: userId },
    attributes: [
      "eventId",
      [db.sequelize.fn("COUNT", db.sequelize.col("EventGuest.id")), "total"],
      [
        db.sequelize.fn(
          "COUNT",
          db.sequelize.literal(
            `CASE WHEN "EventGuest"."status" = '${EVENT_GUEST_STATUS.APPROVED}' THEN 1 END`,
          ),
        ),
        "approved",
      ],
    ],
    group: ["EventGuest.eventId", "event.id"],
    include: [
      {
        model: Event,
        as: "event",
        attributes: ["id", "eventTitle", "eventSlug", "eventStartDate"],
      },
    ],
    raw: true,
    nest: true,
  });

  const events = rows
    .filter((row) => row.event?.id)
    .map((row) => ({
      event: {
        eventTitle: row.event.eventTitle,
        eventSlug: row.event.eventSlug,
        eventStartDate: row.event.eventStartDate,
      },
      total: Number(row.total),
      approved: Number(row.approved),
    }));

  return res.status(200).json({
    data: {
      referralCode: user.referralCode || null,
      totalReferrals: events.reduce((sum, row) => sum + row.total, 0),
      events,
    },
  });
});

/**
 * The guests this user has personally brought to the event — powers the
 * "your invites" list on the referral page.
 *
 * GET /events/guest/referral/referred?eventSlug=
 */
export const getMyReferredGuests = asyncWrapper(async (req, res) => {
  const { eventSlug } = req.query;
  const userId = req.user?.id;

  if (!eventSlug) {
    return res.status(400).json({ message: "eventSlug is required" });
  }

  const event = await Event.findOne({
    where: { eventSlug },
    attributes: ["id"],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const guests = await EventGuest.findAll({
    where: { eventId: event.id, referrerUserId: userId },
    attributes: ["id", "name", "status", "createdAt"],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    data: guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      status: guest.status,
      joinedAt: guest.createdAt,
    })),
  });
});

/**
 * Admin leaderboard: one row per referrer for an event, with how many guests
 * they brought in and their own registration status so the admin can approve
 * them inline.
 *
 * GET /events/guest/referral/leaderboard?eventId=&page=&limit=
 */
export const getReferralLeaderboard = asyncWrapper(async (req, res) => {
  const { eventId } = req.query;
  const { page, limit, offset } = getPaginationParams(req.query);

  if (!eventId) {
    return res.status(400).json({ message: "eventId is required" });
  }

  // Every referrer for this event, ordered by how many guests they brought.
  const grouped = await EventGuest.findAll({
    where: { eventId, referrerUserId: { [Op.ne]: null } },
    attributes: [
      "referrerUserId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "referredCount"],
    ],
    group: ["referrerUserId"],
    order: [[db.sequelize.literal(`"referredCount"`), "DESC"]],
    raw: true,
  });

  const total = grouped.length;
  const pageRows = grouped.slice(offset, offset + limit);

  if (!pageRows.length) {
    return res.status(200).json({
      data: [],
      meta: getMeta(total, page, limit),
    });
  }

  const referrerIds = pageRows.map((row) => row.referrerUserId);

  const [referrers, referrerGuestRows] = await Promise.all([
    User.findAll({
      where: { id: { [Op.in]: referrerIds } },
      attributes: ["id", "fullName", "email", "phone", "referralCode"],
    }),
    // The referrer's own registration for this event — may not exist if they
    // shared a link without registering themselves.
    EventGuest.findAll({
      where: { eventId, userId: { [Op.in]: referrerIds } },
      attributes: ["id", "userId", "name", "email", "phone", "status", "attendeeType"],
    }),
  ]);

  const referrerById = new Map(referrers.map((user) => [user.id, user]));
  const guestByUserId = new Map(
    referrerGuestRows.map((guest) => [guest.userId, guest]),
  );

  const data = pageRows.map((row) => {
    const user = referrerById.get(row.referrerUserId);
    const guest = guestByUserId.get(row.referrerUserId);

    return {
      referrerUserId: row.referrerUserId,
      name: user?.fullName ?? guest?.name ?? "",
      email: user?.email ?? guest?.email ?? "",
      phone: user?.phone ?? guest?.phone ?? "",
      referralCode: user?.referralCode ?? null,
      referredCount: Number(row.referredCount),
      guestId: guest?.id ?? null,
      status: guest?.status ?? null,
      attendeeType: guest?.attendeeType ?? null,
    };
  });

  return res.status(200).json({
    data,
    meta: getMeta(total, page, limit),
  });
});

/**
 * Admin: the guests a given referrer brought to an event.
 *
 * GET /events/guest/referral/referees?eventId=&referrerUserId=
 */
export const getRefereesByReferrer = asyncWrapper(async (req, res) => {
  const { eventId, referrerUserId } = req.query;

  if (!eventId || !referrerUserId) {
    return res.status(400).json({
      message: "eventId and referrerUserId are required",
    });
  }

  const guests = await EventGuest.findAll({
    where: { eventId, referrerUserId },
    attributes: [
      "id",
      "name",
      "email",
      "phone",
      "attendeeType",
      "status",
      "createdAt",
    ],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({ data: guests });
});

/**
 * Admin: approve every waitlisted guest who referred at least `minReferrals`
 * people to this event. Sends the event's Approved template (with calendar
 * invite) the same way the regular bulk status update does.
 *
 * Pass `dryRun: true` to get the affected count without changing anything —
 * the admin UI uses it to preview the action before confirming, since its
 * paginated table cannot count across every page on its own.
 *
 * PATCH /events/guest/event/:eventId/referral/bulk-approve
 */
export const bulkApproveByReferralCount = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { minReferrals, dryRun = false } = req.body;

  const adminId = req.admin?.id;

  const parsedMin = parseInt(minReferrals, 10);

  if (!Number.isFinite(parsedMin) || parsedMin < 1) {
    return res.status(400).json({
      message: "minReferrals must be a positive number",
    });
  }

  const event = await Event.findByPk(eventId);

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const grouped = await EventGuest.findAll({
    where: { eventId, referrerUserId: { [Op.ne]: null } },
    attributes: [
      "referrerUserId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "referredCount"],
    ],
    group: ["referrerUserId"],
    having: db.sequelize.where(
      db.sequelize.fn("COUNT", db.sequelize.col("id")),
      { [Op.gte]: parsedMin },
    ),
    raw: true,
  });

  const qualifyingUserIds = grouped.map((row) => row.referrerUserId);

  if (!qualifyingUserIds.length) {
    return res.status(200).json({
      message: "No referrers matched this criteria",
      updatedCount: 0,
      affectedCount: 0,
    });
  }

  const where = {
    eventId,
    userId: { [Op.in]: qualifyingUserIds },
    status: EVENT_GUEST_STATUS.WAITLISTED,
  };

  const guests = await EventGuest.findAll({ where });

  if (dryRun) {
    return res.status(200).json({
      message: "Preview only — no guests were updated",
      updatedCount: 0,
      affectedCount: guests.length,
    });
  }

  if (!guests.length) {
    return res.status(200).json({
      message: "No waitlisted guests matched this criteria",
      updatedCount: 0,
      affectedCount: 0,
    });
  }

  await EventGuest.update(
    {
      status: EVENT_GUEST_STATUS.APPROVED,
      statusUpdatedBy: adminId,
      statusUpdatedAt: new Date(),
    },
    { where },
  );

  const template = await EventEmailTemplate.findOne({
    where: { eventId, type: EVENT_EMAIL_TEMPLATE_TYPE.APPROVED },
  });

  if (template) {
    const calendarData = {
      title: event.eventTitle,
      description: event.eventSubtitle || "",
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      eventStartTime: event.eventStartTime,
      eventEndTime: event.eventEndTime,
      location: event.location || "",
    };

    for (const guest of guests) {
      try {
        if (!guest.email) continue;

        const html = buildEmail({
          body: BODIES.CUSTOM(template.body, {
            name: capitalizeName(guest.name || "Guest"),
          }),
          header: HEADERS.GRADIENT,
          footer: FOOTERS.GRADIENT,
        });

        const icsContent = generateEventIcsContent({
          ...calendarData,
          attendees: [guest.email],
        });

        await sendMail({
          to: guest.email,
          subject: template.subject,
          html,
          attachments: [
            {
              filename: "invite.ics",
              contentType: "text/calendar",
              content: Buffer.from(icsContent),
            },
          ],
        });
      } catch (err) {
        console.error("Referral bulk approve email error:", guest.email, err);
      }
    }
  }

  return res.status(200).json({
    message: "Referrers approved successfully",
    updatedCount: guests.length,
    affectedCount: guests.length,
  });
});

/**
 * Admin: headline referral numbers for an event.
 *
 * GET /events/guest/referral/stats?eventId=
 */
export const getReferralStats = asyncWrapper(async (req, res) => {
  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ message: "eventId is required" });
  }

  const grouped = await EventGuest.findAll({
    where: { eventId, referrerUserId: { [Op.ne]: null } },
    attributes: [
      "referrerUserId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "referredCount"],
    ],
    group: ["referrerUserId"],
    order: [[db.sequelize.literal(`"referredCount"`), "DESC"]],
    raw: true,
  });

  const totalReferred = grouped.reduce(
    (sum, row) => sum + Number(row.referredCount),
    0,
  );

  let topReferrer = null;

  if (grouped.length) {
    const top = grouped[0];
    const user = await User.findByPk(top.referrerUserId, {
      attributes: ["id", "fullName", "email"],
    });

    topReferrer = {
      referrerUserId: top.referrerUserId,
      name: user?.fullName ?? "",
      email: user?.email ?? "",
      referredCount: Number(top.referredCount),
    };
  }

  return res.status(200).json({
    data: {
      totalReferred,
      totalReferrers: grouped.length,
      topReferrer,
    },
  });
});
