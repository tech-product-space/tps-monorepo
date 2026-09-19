import db from "../../database/postgres/models/index.js";
const { EventGuest, Event, User, AdminUser, EventEmailTemplate } = db;

import {
  EVENT_ATTENDEE_TYPE,
  EVENT_GUEST_STATUS,
} from "../../config/constants/eventGuest.js";
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
import { EVENT_EMAIL_TEMPLATE_TYPE } from "../../config/constants/event.js";
import { Op } from "sequelize";

export const create = asyncWrapper(async (req, res) => {
  const {
    eventId,
    name,
    email,
    countryCode,
    phone,
    attendeeType,
    role,
    collegeName,
    graduationYear,
    referralCode,
    linkedinUrl,
    additionalData = {},
    userId,
  } = req.body;

  if (!name || !email || !phone || !attendeeType) {
    return res.status(400).json({
      message: "Name, phone and attendeeType are required",
    });
  }

  const event = await Event.findByPk(eventId);

  if (!event) {
    return res.status(400).json({
      message: "Event not found",
    });
  }

  const duplicateWhere = {
    eventId,
    [Op.or]: [
      ...(userId ? [{ userId }] : []),
      ...(email ? [{ email }] : []),
    ],
  };

  const existingGuest = await EventGuest.findOne({ where: duplicateWhere });

  if (existingGuest) {
    return res.status(409).json({
      message: "User is already enrolled for event",
    });
  }

  if (attendeeType === EVENT_ATTENDEE_TYPE.PROFESSIONAL && !role) {
    return res.status(400).json({
      message: "Role is required for professionals",
    });
  }

  if (
    attendeeType === EVENT_ATTENDEE_TYPE.STUDENT &&
    (!collegeName || !graduationYear)
  ) {
    return res.status(400).json({
      message: "College name and graduation year are required for students",
    });
  }

  // Codes are minted uppercase, but they arrive from shared links and manual
  // typing — normalise before matching so casing/whitespace never loses a
  // referral attribution.
  const normalisedReferralCode = referralCode
    ? String(referralCode).trim().toUpperCase()
    : null;

  let referrerUserId = null;

  if (normalisedReferralCode) {
    const refUser = await User.findOne({
      where: { referralCode: normalisedReferralCode },
    });

    // Self-referral earns nothing: keep the code on the record for reporting
    // but leave the attribution unset.
    //
    // Email is checked alongside the id because the join dialog registers a
    // visitor *before* they authenticate — `userId` is undefined on that path,
    // so the id comparison alone would let someone credit themselves by typing
    // their own code into the form.
    const isSelfReferral =
      !!refUser &&
      (refUser.id === userId ||
        (!!refUser.email &&
          !!email &&
          refUser.email.toLowerCase() === String(email).toLowerCase()));

    if (refUser && !isSelfReferral) {
      referrerUserId = refUser.id;
    }
  }

  let guestType = "Waitlisted";

  if (["Teardown", "Hackathon"].includes(event.eventType)) {
    guestType = "Approved";
  }

  const guest = await EventGuest.create({
    eventId,
    userId : userId || null,
    isAccountLinked: !!userId,
    name,
    email,
    countryCode,
    phone,
    attendeeType,
    role,
    collegeName,
    graduationYear,
    referralCode: normalisedReferralCode,
    referrerUserId,
    linkedinUrl,
    additionalData,
    status: guestType,
  });

  let emailType = EVENT_EMAIL_TEMPLATE_TYPE.WAITLISTED;

  if (["Teardown", "Hackathon"].includes(event.eventType)) {
    emailType = EVENT_EMAIL_TEMPLATE_TYPE.REGISTERED;
  }

  const template = await EventEmailTemplate.findOne({
    where: {
      eventId: event.id,
      type: emailType,
    },
  });

  if (template && email) {
    const html = buildEmail({
      body: BODIES.CUSTOM(template.body, {
        name: capitalizeName(name),
      }),
      header: HEADERS.GRADIENT,
      footer: FOOTERS.GRADIENT,
    });

    setImmediate(async () => {
      try {
        // 👉 WAITLIST → normal email
        if (emailType === EVENT_EMAIL_TEMPLATE_TYPE.WAITLISTED) {
          await sendMail({
            to: email,
            subject: template.subject,
            html,
          });
        }
        // 👉 APPROVED / REGISTERED → calendar email
        else {
          const calendarEvent = {
            title: event.eventTitle,
            description: event.eventSubtitle || "",
            eventStartDate: event.eventStartDate,
            eventStartTime: event.eventStartTime,
            eventEndTime: event.eventEndTime,
            location: event.location || "",
            attendees: [email],
          };

          const icsContent = generateEventIcsContent(calendarEvent);

          await sendMail({
            to: email,
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
        }
      } catch (err) {
        console.error("Email failed:", err);
      }
    });
  }

  return res.status(201).json({
    message: "Successfully registered for event",
    guestType,
    data: guest,
  });
});

export const linkAccount = asyncWrapper(async (req, res) => {
  const { email, eventId } = req.body;
  const userId = req.user?.id;

  // 1. Check if this user already has a linked record for this event
  const alreadyLinked = await EventGuest.findOne({
    where: { eventId, userId, isAccountLinked: true },
  });

  if (alreadyLinked) {
    return res.status(409).json({
      message: "You are already registered for this event",
      data: alreadyLinked,
    });
  }

  // 2. Find the unlinked guest by email
  const guest = await EventGuest.findOne({
    where: { email, eventId, isAccountLinked: false },
  });

  if (!guest) {
    return res.status(404).json({
      message: "No unlinked registration found for this email and event",
    });
  }

  await guest.update({
    userId,
    isAccountLinked: true,
  });

  return res.status(200).json({
    message: "Account linked successfully",
    data: guest,
  });
});

export const checkUserJoinedEvent = asyncWrapper(async (req, res) => {
  const { eventId, userId, email } = req.query;

  if (!eventId) {
    return res.status(400).json({
      message: "Event ID is required",
    });
  }

  if (!userId && !email) {
    return res.status(400).json({ message: "userId or email is required" });
  }

  const where = {
    eventId,
    [Op.or]: [
      ...(userId ? [{ userId }] : []),
      ...(email ? [{ email }] : []),
    ],
  };

  const guest = await EventGuest.findOne({ where });

  return res.status(200).json({
    joined: !!guest,
    status: guest?.status,
    isAccountLinked: guest?.isAccountLinked ?? false,
  });
});

export const updateStatus = asyncWrapper(async (req, res) => {
  const { guestId } = req.params;
  const { status } = req.body;

  const adminId = req.admin?.id;

  if (!status) {
    return res.status(400).json({
      message: "Status is required",
    });
  }

  const guest = await EventGuest.findByPk(guestId, {
    include: [
      {
        model: Event,
        as: "event",
      },
    ],
  });

  if (!guest) {
    return res.status(404).json({
      message: "Event guest not found",
    });
  }

  await guest.update({
    status,
    statusUpdatedBy: adminId,
    statusUpdatedAt: new Date(),
  });

  const event = guest.event;

  // fetch template
  const template = await EventEmailTemplate.findOne({
    where: {
      eventId: event.id,
      type: status,
    },
  });

  if (template && guest.email) {
    const html = buildEmail({
      body: BODIES.CUSTOM(template.body, {
        name: capitalizeName(guest.name),
      }),
      header: HEADERS.GRADIENT,
      footer: FOOTERS.GRADIENT,
    });

    let attachments = [];

    if (status === EVENT_GUEST_STATUS.APPROVED) {
      const icsContent = generateEventIcsContent({
        title: event.eventTitle,
        description: event.eventSubtitle || "",
        eventStartDate: event.eventStartDate,
        eventEndDate: event.eventEndDate,
        eventStartTime: event.eventStartTime,
        eventEndTime: event.eventEndTime,
        location: event.location || "",
        attendees: [guest.email],
      });

      const inviteBuffer = Buffer.from(icsContent);

      attachments.push({
        filename: "invite.ics",
        contentType: "text/calendar",
        content: inviteBuffer,
      });
    }

    await sendMail({
      to: guest.email,
      subject: template.subject,
      html,
      attachments,
    });
  }

  return res.status(200).json({
    message: "Status updated successfully",
    data: guest,
  });
});

export const bulkUpdateStatus = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { status, attendeeType } = req.body;

  const adminId = req.admin?.id;

  const event = await Event.findByPk(eventId);

  if (!event) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  if (!status || !Object.values(EVENT_GUEST_STATUS).includes(status)) {
    return res.status(400).json({
      message: "Invalid status",
    });
  }

  if (
    attendeeType &&
    !Object.values(EVENT_ATTENDEE_TYPE).includes(attendeeType)
  ) {
    return res.status(400).json({
      message: "Invalid attendeeType",
    });
  }

  const where = {
    eventId,
    status: EVENT_GUEST_STATUS.WAITLISTED,
  };

  if (status) {
    where.status = {
      [Op.and]: [EVENT_GUEST_STATUS.WAITLISTED, { [Op.ne]: status }],
    };
  }

  if (attendeeType) {
    where.attendeeType = attendeeType;
  }

  // get guests with email
  const guests = await EventGuest.findAll({
    where,
  });

  if (!guests.length) {
    return res.status(200).json({
      message: "No guests found",
      updatedCount: 0,
    });
  }

  // update all guests
  await EventGuest.update(
    {
      status,
      statusUpdatedBy: adminId,
      statusUpdatedAt: new Date(),
    },
    { where },
  );

  // fetch template once
  const template = await EventEmailTemplate.findOne({
    where: {
      eventId,
      type: status,
    },
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

        const attachments = [];

        if (status === EVENT_GUEST_STATUS.APPROVED) {
          const icsContent = generateEventIcsContent({
            ...calendarData,
            attendees: [guest.email],
          });

          attachments.push({
            filename: "invite.ics",
            contentType: "text/calendar",
            content: Buffer.from(icsContent),
          });
        }

        const result = await sendMail({
          to: guest.email,
          subject: template.subject,
          html,
          attachments: attachments.length ? attachments : undefined,
        });

        if (result.success) {
          console.log("Email sent", { email: guest.email });
        } else {
          console.error("Email failed", {
            email: guest.email,
            error: result.error,
          });
        }
      } catch (err) {
        console.error("Email error:", guest.email, err);
      }
    }
  }

  return res.status(200).json({
    message: "Guests updated successfully",
    updatedCount: guests.length,
  });
});

export const listForEvent = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { eventId, status } = req.query;

  const where = {};

  if (eventId) where.eventId = eventId;
  if (status) where.status = status;

  const { rows, count } = await EventGuest.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "fullName", "email", "phone"],
      },
      {
        model: AdminUser,
        as: "statusUpdatedAdmin",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  const meta = getMeta(count, page, limit);

  return res.status(200).json({
    data: rows,
    meta,
  });
});

export const getEventGuestStats = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;

  if (!eventId) {
    return res.status(400).json({
      message: "Event ID is required",
    });
  }

  const total = await EventGuest.count({ where: { eventId } });

  const [approved, declined, waitlisted] = await Promise.all([
    EventGuest.count({
      where: { eventId, status: EVENT_GUEST_STATUS.APPROVED },
    }),
    EventGuest.count({
      where: { eventId, status: EVENT_GUEST_STATUS.DECLINED },
    }),
    EventGuest.count({
      where: { eventId, status: EVENT_GUEST_STATUS.WAITLISTED },
    }),
  ]);

  const calcPercentage = (value) =>
    total ? Number(((value / total) * 100).toFixed(2)) : 0;

  const response = {
    total,
    approved: {
      total: approved,
      percentage: calcPercentage(approved),
    },
    declined: {
      total: declined,
      percentage: calcPercentage(declined),
    },
    waitlisted: {
      total: waitlisted,
      percentage: calcPercentage(waitlisted),
    },
    approvalRate: calcPercentage(approved),
  };

  return res.status(200).json({
    data: response,
  });
});
