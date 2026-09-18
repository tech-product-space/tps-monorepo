const { CalBooking } = require("../../models");
const { CALBOOKING_STATUS } = require("../../constants/calbooking");
const { verifyCalSignature } = require("../../utils/veifyCalRequest");
const { getPaginationParams, getMeta } = require("../../utils/pagination");
const { Op } = require("sequelize");
const { postLead } = require("../../service/crm/crmService");
const { extractPhoneDetails } = require("../../utils/helper/phone");

exports.webhook = async (req, res) => {
  try {
    if (!verifyCalSignature(req)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { triggerEvent, payload } = req.body;

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

        // const phone = payload.attendees?.[0]?.phoneNumber;

        // if(phone){
        //   const {countryCode, phoneNumber} = extractPhoneDetails(phone)
        //   // Send lead to CRM
        //   await postLead({
        //     name: payload.attendees?.[0]?.name,
        //     phone: phoneNumber,
        //     country_code: countryCode,
        //     email: payload.attendees?.[0]?.email,
        //     product_id: "Calcom",
        //   });
        // }

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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

exports.listBookings = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { filter = "all" } = req.query;

    const now = new Date(new Date().toISOString());

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
        where.status = "cancelled";
        break;

      case "rescheduled":
        where.status = "rescheduled";
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
      data: rows,
      meta,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to fetch bookings",
    });
  }
};
