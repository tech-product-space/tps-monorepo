import db from "../../database/postgres/models/index.js";
import { CALBOOKING_STATUS } from "../../config/constants/calbooking.js";
import { verifyCalSignature } from "../../util/helpers/verifyCalRequest.js";
import { getPaginationParams, getMeta } from "../../util/helpers/pagination.js";
import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const { CalBooking } = db;

export const webhook = asyncWrapper(async (req, res) => {
  if (!verifyCalSignature(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { triggerEvent, payload } = req.body;
  if (!payload) {
    return res.status(400).json({ error: "Missing payload" });
  }

  const bookingUid = payload.uid;
  const iCalUID = payload.iCalUID;
  const notes = payload.responses?.notes?.value || null;
  const cancellationReason = payload.cancellationReason || null;
  const rescheduleReason = payload.responses?.rescheduleReason?.value || null;
  const meetingUrl = payload.metadata?.videoCallUrl;

  switch (triggerEvent) {
    case "BOOKING_CREATED":
      await CalBooking.findOrCreate({
        where: { iCalUID },
        defaults: {
          bookingUid,
          iCalUID,
          eventTitle: payload.title,
          eventType: payload.eventType?.slug,
          startTime: payload.startTime,
          endTime: payload.endTime,
          attendeeName: payload.attendees?.[0]?.name,
          attendeeEmail: payload.attendees?.[0]?.email,
          attendeePhone: payload.attendees?.[0]?.phoneNumber,
          attendeeTimeZone: payload.attendees?.[0]?.timeZone,
          attendeeNotes: notes,
          meetingUrl,
          status: CALBOOKING_STATUS.BOOKED,
          rawPayload: payload,
        },
      });
      break;

    case "BOOKING_CANCELLED":
      await CalBooking.update(
        { status: CALBOOKING_STATUS.CANCELLED, cancellationReason },
        { where: { iCalUID } },
      );
      break;

    case "BOOKING_RESCHEDULED":
      await CalBooking.update(
        {
          status: CALBOOKING_STATUS.RESCHEDULED,
          startTime: payload.startTime,
          endTime: payload.endTime,
          meetingUrl,
          rescheduleReason,
        },
        { where: { iCalUID } },
      );
      break;
  }

  res.status(200).json({ success: true });
});

export const listBookings = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { filter = "all" } = req.query;

  const now = new Date();

  const where = {};
  let order = [["startTime", "ASC"]];

  switch (filter) {
    case "upcoming":
      where.status = { [Op.ne]: CALBOOKING_STATUS.CANCELLED };
      where.startTime = { [Op.gte]: now };
      break;

    case "expired":
      where.status = { [Op.ne]: CALBOOKING_STATUS.CANCELLED };
      where.endTime = { [Op.lt]: now };
      order = [["startTime", "DESC"]];
      break;

    case "cancelled":
      where.status = CALBOOKING_STATUS.CANCELLED;
      break;

    case "rescheduled":
      where.status = CALBOOKING_STATUS.RESCHEDULED;
      break;

    case "all":
    default:
      break;
  }

  const { count, rows } = await CalBooking.findAndCountAll({
    where,
    limit,
    offset,
    order,
  });

  const meta = getMeta(count, page, limit);

  res.status(200).json({
    success: true,
    data: rows,
    meta,
  });
});

function mapCalStatus(calStatus) {
  const s = String(calStatus || "").toLowerCase();
  if (s === "cancelled" || s === "rejected") return CALBOOKING_STATUS.CANCELLED;
  if (s === "rescheduled") return CALBOOKING_STATUS.RESCHEDULED;
  return CALBOOKING_STATUS.BOOKED;
}

export const syncBookings = asyncWrapper(async (req, res) => {
  const apiKey = req.body?.apiKey || process.env.CAL_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      error: "Cal.com API key is required (pass apiKey in body or set CAL_API_KEY in .env)",
    });
  }

  const axios = (await import("axios")).default;
  let cursor = null;
  let syncedCount = 0;

  try {
    while (true) {
      const response = await axios.get("https://api.cal.com/v2/bookings", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "cal-api-version": "2024-08-13",
        },
        params: {
          take: 100,
          ...(cursor ? { cursor } : {}),
        },
      });

      const bookings = response.data?.data || [];
      if (!bookings.length) break;

      for (const booking of bookings) {
        const bookingUid = booking.uid || String(booking.id);
        const iCalUID = booking.iCalUID || bookingUid;
        const attendee = booking.attendees?.[0] || {};
        const startTime = booking.start || booking.startTime;
        const endTime = booking.end || booking.endTime;
        const meetingUrl = booking.meetingUrl || booking.metadata?.videoCallUrl || null;
        const status = mapCalStatus(booking.status);

        const notes =
          booking.responses?.notes?.value ||
          booking.responses?.notes ||
          booking.description ||
          null;

        const cancellationReason = booking.cancellationReason || null;
        const rescheduleReason =
          booking.responses?.rescheduleReason?.value ||
          booking.responses?.rescheduleReason ||
          null;

        await CalBooking.upsert({
          bookingUid,
          iCalUID,
          eventTitle: booking.title || booking.eventTitle || "Booking",
          eventType: booking.eventType?.slug || booking.eventType?.title || null,
          startTime,
          endTime,
          attendeeName: attendee.name || null,
          attendeeEmail: attendee.email || null,
          attendeePhone: attendee.phoneNumber || attendee.phone || null,
          attendeeTimeZone: attendee.timeZone || null,
          attendeeNotes: notes,
          cancellationReason,
          rescheduleReason,
          meetingUrl,
          status,
          rawPayload: booking,
        });

        syncedCount++;
      }

      const nextCursor = response.data?.pagination?.nextCursor;
      if (nextCursor && nextCursor !== cursor) {
        cursor = nextCursor;
      } else {
        break;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully synced ${syncedCount} bookings from Cal.com`,
      syncedCount,
    });
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const calMessage =
        err.response.data?.message ||
        err.response.data?.error ||
        "Cal.com API request failed";

      return res.status(status === 401 ? 401 : 400).json({
        success: false,
        error: status === 401 ? "Invalid or expired Cal.com API key" : calMessage,
      });
    }

    console.error("Cal.com sync error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to sync bookings from Cal.com",
    });
  }
});
