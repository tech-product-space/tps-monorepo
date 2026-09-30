const { formatDataTime } = require("../../../utils/date");
const { extractPhoneDetails } = require("../../../utils/helper/phone");

module.exports = function mapCalBookingLead(booking) {
  const { countryCode, phoneNumber } = extractPhoneDetails(
    booking.attendeePhone,
  );

  return {
    name: booking.attendeeName,
    email: booking.attendeeEmail,
    phone: phoneNumber ?? "",

    source: "Website",
    sub_source: "Contact Us",
    Course: "Contact Us",

    "custom_fields.timestamp": formatDataTime(booking.createdAt),
    "custom_fields.query": booking.attendeeNotes ?? "",
    "custom_fields.countrycode": countryCode ?? "",

    additional_data: {
      lead_id: booking.id,
      booking_uid: booking.bookingUid,
      eventTitle: booking.eventTitle ?? "",
      eventType: booking.eventType ?? "",
      startTime: formatDataTime(booking.startTime),
      endTime: formatDataTime(booking.endTime),
      timezone: booking.attendeeTimeZone ?? "",
      meetingUrl: booking.meetingUrl ?? "",
    },
  };
};
