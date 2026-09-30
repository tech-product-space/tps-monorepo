const { formatDataTime } = require("../../../utils/date");
const mapUTMs = require("./utm.mapper");

module.exports = function mapEventGuestLead(guest) {
  return {
    name: guest.name ?? guest.user.name ?? "Anonymous",
    email: guest.user?.email ?? guest.additionalData?.email ?? "",
    phone: guest.phone ?? guest.user.phone ?? "N/A",

    source: "Website",
    sub_source: "Event",
    Course: "Event",

    "custom_fields.eventname": guest.event?.eventTitle ?? guest.event?.eventSlug ?? guest.eventName ?? "",
    "custom_fields.profession": guest.userType ?? "",
    "custom_fields.role": guest.role ?? "",
    "custom_fields.collegename": guest.collegeName ?? "",
    "custom_fields.yearofgraduation": guest.graduationYear ?? "",
    "custom_fields.linkedin": guest.linkedin ?? "",
    "custom_fields.referralcode": guest.referralCode ?? "",
    "custom_fields.timestamp": formatDataTime(guest.createdAt),

    ...mapUTMs(guest.additionalData),

    additional_data: {
      lead_id: guest.id,
      event_id: guest.eventId,
      visitor_id: guest.additionalData.visitorId || null,
    },
  };
};
