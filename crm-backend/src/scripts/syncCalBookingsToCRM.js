require("dotenv").config();

const { Sequelize } = require("sequelize");
const { QueryTypes } = require("sequelize");

const leadService = require("../services/lead.service");
const { extractPhoneDetails } = require("../utils/helper/phone");

const tpsDB = new Sequelize(process.env.TPS_DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

async function run() {
  try {
    const bookings = await tpsDB.query(
      `
      SELECT *
      FROM cal_bookings
      ORDER BY "createdAt" ASC
      LIMIT 100
      `,
      { type: QueryTypes.SELECT },
    );

    console.log(`Found ${bookings.length} bookings`);

    for (const booking of bookings) {
      try {
        if (!booking.attendeePhone) continue;

        const { countryCode, phoneNumber } = extractPhoneDetails(
          booking.attendeePhone,
        );

        await leadService.createOrProcessReentry({
          product_id: "Calcom",
          name: booking.attendeeName,
          email: booking.attendeeEmail,
          phone: phoneNumber,
          country_code: countryCode,

          extra_fields: {
            status: booking.status,
            eventTitle: booking.eventTitle,
            eventType: booking.eventType,
            startTime: booking.startTime,
            endTime: booking.endTime,
            notes: booking.attendeeNotes,
            meetingUrl: booking.meetingUrl,
          },

          additional_data: {
            bookingUid: booking.bookingUid,
            iCalUID: booking.iCalUID,
          },
        });

        console.log(`Synced booking ${booking.bookingUid}`);
      } catch (err) {
        console.error("Booking failed:", booking.id, err.message);
      }
    }

    console.log("Sync completed");
    process.exit();
  } catch (error) {
    console.error(error);
  }
}

run();
