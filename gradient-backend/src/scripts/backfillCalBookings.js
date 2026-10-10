import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import db from "../database/postgres/models/index.js";
import { CALBOOKING_STATUS } from "../config/constants/calbooking.js";

const { CalBooking } = db;

function mapCalStatus(calStatus) {
  const s = String(calStatus || "").toLowerCase();
  if (s === "cancelled" || s === "rejected") {
    return CALBOOKING_STATUS.CANCELLED;
  }
  if (s === "rescheduled") {
    return CALBOOKING_STATUS.RESCHEDULED;
  }
  return CALBOOKING_STATUS.BOOKED;
}

async function fetchAndSync() {
  const argKey = process.argv.find((a) => a.startsWith("--apiKey="))?.split("=")[1];
  const apiKey = argKey || process.env.CAL_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: Cal.com API key is required.");
    console.log("Usage: node src/scripts/backfillCalBookings.js --apiKey=<YOUR_CAL_API_KEY>");
    console.log("Or add CAL_API_KEY=<YOUR_CAL_API_KEY> to your .env file.");
    process.exit(1);
  }

  console.log("🔄 Connecting to Cal.com API v2 to fetch existing bookings...");

  let cursor = null;
  let totalImported = 0;
  let page = 1;

  try {
    while (true) {
      const url = "https://api.cal.com/v2/bookings";
      const params = {
        take: 100,
        ...(cursor ? { cursor } : {}),
      };

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "cal-api-version": "2024-08-13",
        },
        params,
      });

      const json = response.data;
      const bookings = json.data || [];

      if (!bookings.length) {
        if (page === 1) {
          console.log("ℹ️ No bookings found in this Cal.com account.");
        }
        break;
      }

      console.log(`📥 Page ${page}: processing ${bookings.length} bookings...`);

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

        totalImported++;
      }

      const nextCursor = json.pagination?.nextCursor;
      if (nextCursor && nextCursor !== cursor) {
        cursor = nextCursor;
        page++;
      } else {
        break;
      }
    }

    console.log(`✅ Finished! Successfully synced ${totalImported} bookings into your database.`);
    process.exit(0);
  } catch (err) {
    if (err.response) {
      console.error("❌ Cal.com API Error:", err.response.status, err.response.data);
    } else {
      console.error("❌ Error fetching bookings:", err.message);
    }
    process.exit(1);
  }
}

fetchAndSync();
