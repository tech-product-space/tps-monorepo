const { EventEmailReminder, EmailTemplate, EventRegistration, ReferralCode, EventGuests, CohortMember, users, Event, sequelize } = require('../models');
const { sendGraphEmail } = require('../utils/email/sendGraphEmail');
const { Op, Sequelize } = require("sequelize");
const moment = require('moment-timezone');
const { toSlug, isValidSlug } = require('../utils/slugHelpers.js');
const { getPaginationParams, getMeta } = require('../utils/pagination.js');
const { replacePlaceholders, cleanHtml, wrapEmailTemplate } = require('../utils/email/htmlHelpers.js');
const { triggerEventCreatedEmail } = require('../service/events/eventCreateEmail.service.js');
const { duplicateEvent: duplicateEventService, DuplicateEventError } = require('../service/events/duplicateEvent.service.js');

exports.createEvent = async (req, res) => {
    try {
        const {
            eventTitle,
            eventSubtitle,
            eventStartDate,
            eventEndDate,
            eventStartTime,
            eventEndTime,
            eventType,
            ctaType,
            speakers,
            numberOfAttendees,
            eventCreativeUrl,
            tags,
            location,
            locationType,
            isPublished,
            eventDetails,
            eventSlug,
            eventCategory
        } = req.body;

        // Basic required fields check
        if (!eventTitle || !eventStartDate || !eventEndDate || !eventType || !ctaType || !eventSlug) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Validate slug format
        if (!isValidSlug(eventSlug)) {
            return res.status(400).json({
                error: "Invalid slug format. Use only lowercase letters, numbers, and hyphens."
            });
        }

        // Check for slug uniqueness
        const existingSlug = await Event.findOne({
            where: { eventSlug },
        });

        if (existingSlug) {
            return res.status(409).json({
                error: "Event slug already in use. Please choose a different one."
            });
        }

        const newEvent = await Event.create({
            eventTitle,
            eventSubtitle,
            eventStartDate,
            eventEndDate,
            eventStartTime,
            eventEndTime,
            eventType,
            ctaType,
            speakers,
            numberOfAttendees,
            eventCreativeUrl,
            tags,
            location,
            locationType,
            isPublished,
            eventDetails,
            eventSlug,
            eventCategory
        });

        return res.status(201).json({
            result: "SUCCESS",
            newEvent
        });
    } catch (error) {
        console.error("Error creating event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.createEventGuest = async (req, res) => {
    try {
        const {
            linkedin,
            name,
            phone,
            referralCode,
            role,
            graduationYear,
            collegeName,
            userType,
            eventId,
            userId,
            additionalData,
        } = req.body;

        //  Basic validation
        if (!userId || !eventId) {
            return res.status(400).json({
                success: false,
                message: "userId and eventId are required",
            });
        }

        // Fetch event
        const event = await Event.findByPk(eventId);
        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found",
            });
        }

        // Check duplicate registration
        const existing = await EventGuests.findOne({
            where: { userId, eventId },
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "User already registered for this event",
            });
        }

        // ======================
        //  APPROVAL LOGIC 
        // ======================

        let guestType = "Waitlist";
        let approvalSource = "WAITLISTED";

        /**
         * Community Event + Referral Code
         * If referral belongs to ACTIVE cohort member → APPROVE
         */
        if (["Community", "InternalCohort"].includes(event.eventCategory) && referralCode) {
            const referral = await ReferralCode.findOne({
                where: { code: referralCode },
                attributes: ["userId"],
            });

            if (referral) {
                const referrerJoined = await EventGuests.findOne({
                    where: {
                        userId: referral.userId,
                        eventId: event.id
                    }
                })

                const isReferrerCohortMember = await CohortMember.findOne({
                    where: {
                        userId: referral.userId,
                        status: "Active",
                    },
                });

                if (referrerJoined && isReferrerCohortMember) {
                    guestType = "Approved";
                    approvalSource = "REFERRAL_COHORT_MEMBER";
                }
            }
        }

        /**
         * Community Event + User is Cohort Member
         */
        if (
            guestType !== "Approved" &&
            ["Community", "InternalCohort"].includes(event.eventCategory)
        ) {
            const isUserCohortMember = await CohortMember.findOne({
                where: {
                    userId,
                    status: "Active",
                },
            });

            if (isUserCohortMember) {
                guestType = "Approved";
                approvalSource = "COHORT_MEMBER";
            }
        }

        /**
         *  Auto-approved event types
         */
        if (
            guestType !== "Approved" &&
            ["Teardown", "Hackathon"].includes(event.eventType)
        ) {
            guestType = "Approved";
            approvalSource = "EVENT_AUTO_APPROVED";
        }

        // =========================
        //  Clean additionalData
        // =========================

        const cleanedAdditionalData =
            additionalData && typeof additionalData === "object"
                ? Object.fromEntries(
                    Object.entries(additionalData).filter(
                        ([_, value]) => value !== undefined && value !== null
                    )
                )
                : {};

        // =====================
        //  Create Event Guest
        // =====================

        await EventGuests.create({
            linkedin,
            name,
            phone,
            referralCode,
            role,
            graduationYear,
            collegeName,
            userType,
            eventType: event.eventType,
            guestType,
            eventId,
            userId,
            additionalData: cleanedAdditionalData,
        });

        // ======================================================
        // Fire email in background
        // ======================================================

        setImmediate(() => {
            triggerEventCreatedEmail({
                userId,
                eventId,
                guestType,
                userType,
            }).catch((err) => {
                console.error("Background email failed:", err);
            });
        });

        // ==============
        // Response
        // ==============

        return res.status(201).json({
            success: true,
            result: "SUCCESS",
            guestType,
            approvalSource,
        });
    } catch (error) {
        console.error("Error creating event guest:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

exports.getEventSuccessDetails = async (req, res) => {
    try {
        const { userId, slug } = req.params;

        // Find event by slug   --> To Get the Event
        const event = await Event.findOne({
            where: { eventSlug: slug },
            attributes: ["id", "eventTitle", "eventType", "eventCategory", "eventDetails"],
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found",
            });
        }

        // Fetch event guest record  --> To Get the Guest Details
        const guest = await EventGuests.findOne({
          where: {
            userId,
            eventId: event.id,
          },
          attributes: [
            "guestType",
            "referralCode",
            "userType",
            "name",
            "phone",
            "additionalData",
          ],
          include: [
            {
              model: users,
              as: "user", 
              attributes: ["email"],
            },
          ],
        });

        if (!guest) {
            return res.status(403).json({
                success: false,
                message: "User not registered for this event",
            });
        }


        // Check if user is cohort member   --> To check of he is a cohort member
        const cohortMember = await CohortMember.findOne({
            where: {
                userId,
                status: "Active",
            },
            attributes: ["id"],
        });

        const isCohortMember = !!cohortMember;

        // Get user's referral code   --> Will be used to show his referral code to copy
        const userReferralCode = await ReferralCode.findOne({
            where: { userId },
        });

        // Count how many users THIS USER referred
        let totalReferralsMade = 0;

        // Get No. of Referral made by user   
        if (userReferralCode) {
            totalReferralsMade = await EventGuests.count({
                where: {
                    referralCode: userReferralCode.code,
                    eventId: event.id
                },
            });
        }

        // Find who referred THIS USER
        let referredBy = null;

        if (guest.referralCode) {
            const referralOwner = await ReferralCode.findOne({
                where: { code: guest.referralCode },
                attributes: ["userId"],
                include: [
                    {
                        model: users,
                        as: "referrer",
                        attributes: ["id", "name"],
                    },
                ],
            });

            if (referralOwner) {
                // console.log("referralOwner" , referralOwner.userId)
                const activeCohortMember = await CohortMember.findOne({
                    where: {
                        userId: referralOwner.userId,
                        status: "Active",
                    },
                    attributes: ["id"],
                });

                referredBy = {
                    // userId: referralOwner.userId,
                    name: referralOwner.referrer?.name || null,
                    isCohortMember: Boolean(activeCohortMember),
                };
            }
        }

        // Resolve WhatsApp link by the guest's registered user type,
        // falling back to the default Link when no type-specific link is set
        const whatsapp = event.eventDetails?.whatsappLink || {};
        let resolvedWhatsappLink = whatsapp.Link;
        if (guest.userType === "Student" && whatsapp.studentLink) {
            resolvedWhatsappLink = whatsapp.studentLink;
        } else if (guest.userType === "Professional" && whatsapp.professionalLink) {
            resolvedWhatsappLink = whatsapp.professionalLink;
        }

        // Final response
        return res.status(200).json({
            success: true,
            data: {
                event: {
                    id: event.id,
                    title: event.eventTitle,
                    eventType: event.eventType,
                    eventCategory: event.eventCategory,
                    whatsappLink: resolvedWhatsappLink
                },
                registration: {
                    name: guest.name,
                    email: guest.user?.email || "",
                    phone: guest.phone,
                    countryCode: guest.additionalData?.country_code,
                    guestType: guest.guestType,
                    userType: guest.userType,
                },
                user: {
                    // userId,
                    isCohortMember,
                    referralStats: {
                        referralCode: userReferralCode?.code || null,
                        totalReferralsMade,
                    },
                    referredBy,
                }
            }
        })
    } catch (error) {
        console.error("Error fetching success page details:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

exports.getUsersByEventId = async (req, res) => {
    try {
        const { eventId } = req.body;

        if (!eventId) {
            return res.status(400).json({ error: "eventId is required" });
        }

        const registrations = await EventGuests.findAll({
            where: { eventId },
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ["email", "profile_picture"]
                }
            ],
            order: [["createdAt", "DESC"]]
        });

        res.status(200).json({
            result: "SUCCESS",
            registrations
        });
    } catch (error) {
        console.error("Error fetching users by eventId:", error);
        res.status(500).json({ result: "ERROR", message: "Internal server error" });
    }
};

exports.approveGuests = async (req, res) => {
    try {
        const { userIds, status, eventId } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !eventId) {
            return res.status(400).json({ error: "userIds (array) and eventId are required" });
        }

        const [updatedCount] = await EventGuests.update(
            { guestType: status },
            {
                where: {
                    userId: { [Op.in]: userIds },
                    eventId,
                    guestType: "Waitlist"
                }
            }
        );

        res.status(200).json({
            result: "SUCCESS",
            message: `${updatedCount} guest(s) approved`
        });
    } catch (error) {
        console.error("Error approving guests:", error);
        res.status(500).json({ result: "ERROR", message: "Internal server error" });
    }
};

exports.getAllEvents = async (req, res) => {
    try {
        // Set timezone to your region
        const startOfToday = moment().tz("Asia/Kolkata").startOf("day").toDate();

        const events = await Event.findAll({
            where: {
                eventEndDate: {
                    [Op.gte]: startOfToday,
                },
            },
            attributes: { exclude: ['eventDetails'] },
            order: [["createdAt", "DESC"]],
        });

        res.status(200).json({ result: "SUCCESS", events });
    } catch (error) {
        console.error("Error fetching all events:", error);
        res.status(500).json({ result: "ERROR", message: "Internal server error" });
    }
};

exports.getPastEvents = async (req, res) => {
    try {
        const startOfToday = moment().tz("Asia/Kolkata").startOf("day").toDate();

        const events = await Event.findAll({
            where: {
                eventEndDate: {
                    [Op.lt]: startOfToday
                }
            },
            order: [["eventEndDate", "DESC"]]
        });

        const result = events.map(event => {
            let eventVideoUrl = "";
            if (event.eventDetails && typeof event.eventDetails === 'object') {
                eventVideoUrl = event.eventDetails.eventVideoUrl || {};
            }
            const { eventDetails, ...rest } = event.toJSON();
            return { ...rest, eventVideoUrl };
        });

        res.status(200).json({ result: "SUCCESS", events: result });
    } catch (error) {
        console.error("Error fetching past events:", error);
        res.status(500).json({ result: "ERROR", message: "Internal server error" });
    }
};

exports.getEventById = async (req, res) => {
    try {
        const { id } = req.params;

        const event = await Event.findByPk(id);

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        res.status(200).json({
            result: "SUCCESS",
            event
        });
    } catch (error) {
        console.error("Error fetching event by ID:", error);
        res.status(500).json({ result: "ERROR", message: "Internal server error" });
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const event = await Event.findByPk(id);
        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        await event.update(updates);

        res.status(200).json({
            result: "SUCCESS",
            message: "Event updated successfully",
            updatedEvent: event
        });
    } catch (error) {
        console.error("Error updating event:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.duplicateEvent = async (req, res) => {
    try {
        const { id } = req.params;

        const { newEvent, copied } = await duplicateEventService(id, req.body);

        return res.status(201).json({
            result: "SUCCESS",
            message: "Event duplicated successfully",
            newEvent,
            copied
        });
    } catch (error) {
        if (error instanceof DuplicateEventError) {
            return res.status(error.status).json({ error: error.message });
        }
        console.error("Error duplicating event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.updateEventPublishStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isPublished } = req.body;

        if (typeof isPublished !== 'boolean') {
            return res.status(400).json({ error: "'isPublished' must be a boolean value" });
        }

        const event = await Event.findByPk(id);

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        event.isPublished = isPublished;
        await event.save();

        return res.status(200).json({
            result: "SUCCESS",
            message: `Event ${isPublished ? "published" : "unpublished"} successfully`,
            event,
        });
    } catch (error) {
        console.error("Error updating publish status:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.registerEvent = async (req, res) => {
    try {
        const { userId, eventName, referralCode } = req.body;

        if (!userId || !eventName) {
            return res.status(400).json({ error: 'userId and eventName are required' });
        }

        // Check if user already registered for this event
        const existingRegistration = await EventRegistration.findOne({
            where: { userId, eventName }
        });

        if (existingRegistration) {
            return res.status(400).json({
                result: "WARNING",
                message: "User already registered for this event"
            });
        }

        let referredByCode = null;

        if (referralCode) {
            const ref = await ReferralCode.findOne({ where: { code: referralCode } });

            if (!ref) {
                return res.status(400).json({ result: "WARNING", message: 'Invalid referral code' });
            }

            if (ref.userId === userId) {
                return res.status(400).json({ result: "WARNING", message: 'You cannot use your own referral code' });
            }

            referredByCode = ref.code;
        }

        await EventRegistration.create({
            userId,
            eventName,
            referredByCode,
        });

        res.json({ result: "SUCCESS", message: "Referral code is applied" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ result: "ERROR", message: 'Server error' });
    }
};

exports.checkEventGuest = async (req, res) => {
    try {
        const { userId, eventSlug } = req.body;

        // Validate inputs
        if (!userId || !eventSlug) {
            return res.status(400).json({ error: "userId and eventSlug are required" });
        }

        // Step 1: find event by slug
        const event = await Event.findOne({ where: { eventSlug } });

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        const isCohortUser = !!(await CohortMember.findOne({
            where: { userId, status: "Active" },
        }));


        // Step 2: check if user is registered for that event
        const existingGuest = await EventGuests.findOne({
            where: { userId, eventId: event.id },
            attributes: ["id", "guestType"],
        });

        if (existingGuest) {
            return res.status(200).json({
                result: "SUBMITTED",
                message: "User already registered for this event",
                guestType: existingGuest.guestType,
                isCohortUser,
            });
        } else {
            return res.status(200).json({
                result: "NOT_FOUND",
                message: "User has not registered for this event",
                isCohortUser,
            });
        }
    } catch (error) {
        console.error("Error checking event guest:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if event exists
        const event = await Event.findByPk(id);

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        // Optionally, delete associated guests and registrations if necessary
        // await EventGuests.destroy({ where: { eventId: id } });
        // await EventRegistration.destroy({ where: { eventName: event.eventTitle } });

        await event.destroy();

        return res.status(200).json({
            result: "SUCCESS",
            message: "Event deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getEventByTitle = async (req, res) => {
    try {
        const { eventTitle } = req.body;

        if (!eventTitle) {
            return res.status(400).json({ error: "eventTitle is required" });
        }

        const event = await Event.findOne({
            where: { eventTitle },
        });

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        res.status(200).json({
            result: "SUCCESS",
            event,
        });
    } catch (error) {
        console.error("Error fetching event by title:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getGuestsWithReferees = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const referralUsageRows = await EventGuests.findAll({
      where: {
        eventId,
        referralCode: { [Op.ne]: null },
      },
      attributes: [
        "referralCode",
        [sequelize.fn("COUNT", sequelize.col("referralCode")), "memberCount"],
      ],
      group: ["referralCode"],
      raw: true,
    });

    if (!referralUsageRows.length) {
      return res.status(200).json({ result: "SUCCESS", data: [] });
    }

    const referralCodesUsed = referralUsageRows.map((r) => r.referralCode);

    const usageMap = Object.fromEntries(
      referralUsageRows.map((r) => [r.referralCode, Number(r.memberCount)])
    );

    const referralDetails = await ReferralCode.findAll({
      where: { code: { [Op.in]: referralCodesUsed } },
      include: [
        {
          model: users,
          as: "referrer",
          attributes: ["id", "name", "email", "phone"],
          required: true,
        },
      ],
    });

    if (!referralDetails.length) {
      return res.status(200).json({ result: "SUCCESS", data: [] });
    }

    const referrerUserIds = referralDetails.map((rc) => rc.referrer.id);

    const referrerGuestEntries = await EventGuests.findAll({
      where: {
        eventId,
        userId: { [Op.in]: referrerUserIds },
      },
      include: [
        {
          model: users,
          as: "user",
          attributes: ["id", "name", "email", "phone"],
          required: false,
        },
      ],
    });

    const referrerGuestMap = Object.fromEntries(
      referrerGuestEntries.map((g) => [
        g.userId,
        {
          guestId: g.id,
          name: g?.name ?? "",
          phone: g?.phone ?? "",
          referralCode: g.referralCode,
          guestType: g.guestType,
          userType:g.userType
        },
      ])
    );

    const data = referralDetails.map((rc) => ({
      id: rc.referrer.id,
      name: rc.referrer.name,
      email: rc.referrer.email ?? "",
      phone: rc.referrer.phone ?? "",
      referralCode: rc.code,
      memberCount: usageMap[rc.code] ?? 0,
      referrerDetail: referrerGuestMap[rc.referrer.id] ?? null, 
    }));

    return res.status(200).json({ result: "SUCCESS", data });
  } catch (error) {
    console.error("Error fetching guests with referees:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getGuestsWithRefereesBySlug = async (req, res) => {
    try {
        const { eventSlug } = req.body; // ✅ read from body now
        if (!eventSlug) {
            return res.status(400).json({ error: "eventSlug is required" });
        }

        // Step 1: find event by slug
        const event = await Event.findOne({ where: { eventSlug } });
        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        // Step 2: get guests with referral codes
        const guests = await EventGuests.findAll({
            where: {
                eventId: event.id,
                referralCode: { [Op.ne]: null },
            },
            attributes: ["referralCode"],
        });

        const referralCodesUsed = guests.map((g) => g.referralCode);
        if (referralCodesUsed.length === 0) {
            return res.status(200).json({ result: "SUCCESS", data: [] });
        }

        // Step 3: count how many used each code
        const referralUsage = await EventGuests.findAll({
            where: {
                eventId: event.id,
                referralCode: { [Op.in]: referralCodesUsed },
            },
            attributes: [
                "referralCode",
                [sequelize.fn("COUNT", sequelize.col("referralCode")), "memberCount"],
            ],
            group: ["referralCode"],
        });

        // Step 4: get referrer info
        const referralDetails = await ReferralCode.findAll({
            where: { code: { [Op.in]: referralCodesUsed } },
            include: [
                {
                    model: users,
                    as: "referrer",
                    attributes: ["id", "name", "email", "phone"],
                },
            ],
        });

        // Step 5: merge
        const result = referralDetails.map((rc) => {
            const usage = referralUsage.find((u) => u.referralCode === rc.code);
            return {
                id: rc.referrer?.id,
                name: rc.referrer?.name,
                email: rc.referrer?.email || "",
                phone: rc.referrer?.phone || "",
                referralCode: rc.code,
                memberCount: usage ? usage.get("memberCount") : 0,
            };
        });

        return res.status(200).json({ result: "SUCCESS", data: result });
    } catch (error) {
        console.error("Error fetching guests with referees:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};


exports.getRefereesByReferralCode = async (req, res) => {
    try {
        const { eventId, referralCode } = req.body;

        if (!eventId || !referralCode) {
            return res.status(400).json({ error: "eventId and referralCode are required" });
        }

        const referrals = await EventGuests.findAll({
            where: {
                eventId,
                referralCode
            },
            include: [{
                model: users,
                as: 'user',
                attributes: ['id', 'name', 'email', 'phone']
            }]
        });

        const referredMembers = referrals.map(ref => ({
            id: ref.user?.id,
            name: ref.user?.name,
            email: ref.user?.email || "",
            phone: ref.user?.phone || ""
        }));

        // Get referrer userId
        const referralOwner = await ReferralCode.findOne({
            where: { code: referralCode },
            include: [{
                model: users,
                as: 'referrer',
                attributes: ['id']
            }]
        });

        return res.status(200).json({
            referralId: referralOwner?.user?.id,
            referralCode,
            referredMembers
        });
    } catch (error) {
        console.error("Error fetching referees by referral code:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.checkReferralCodes = async (req, res) => {
    try {
        const userId = parseInt(req.query.userId, 10);
        if (!userId) {
            return res.status(400).json({ error: 'userId is required or invalid' });
        }

        const existingCodes = await ReferralCode.findAll({
            where: { userId },
            attributes: ['code', 'eventId', 'createdAt']
        });

        if (existingCodes.length > 0) {
            return res.status(200).json({
                exists: true,
                referralCodes: existingCodes.map(rc => ({
                    code: rc.code,
                    eventId: rc.eventId,
                    createdAt: rc.createdAt
                }))
            });
        }

        return res.status(200).json({ exists: false });
    } catch (err) {
        console.error('Error checking referral codes:', err);
        res.status(500).json({ result: "ERROR", message: err.message || "Internal server error" });
    }
};

exports.saveEmailTemplate = async (req, res) => {
    try {
        const { eventId, type, body, subject, date, startTime, endTime } = req.body;

        if (!eventId || !type || !body) {
            return res
                .status(400)
                .json({ error: "eventId, type, and body are required" });
        }

        if (type == "Pending" || type == "Declined") {
            // Handle specific logic for Pending and Declined types
            const [template, created] = await EmailTemplate.upsert(
                { eventId, type, body, subject },
                { returning: true }
            );
            res.status(200).json({
                result: created ? "CREATED" : "UPDATED",
                template,
            });
        } else {
            // Handle specific logic for other types
            const [template, created] = await EmailTemplate.upsert(
                { eventId, type, body, subject, date, startTime, endTime },
                { returning: true }
            );
            res.status(200).json({
                result: created ? "CREATED" : "UPDATED",
                template,
            });
        }


    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEmailTemplate = async (req, res) => {
    try {
        const { eventId, type } = req.body;

        if (!eventId || !type) {
            return res
                .status(400)
                .json({ error: "eventId and type are required" });
        }

        const template = await EmailTemplate.findOne({
            where: { eventId, type },
        });

        if (!template) {
            return res
                .status(404)
                .json({ error: "Email template not found" });
        }

        res.status(200).json({ result: "SUCCESS", template });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEventByIdWithGuestType = async (req, res) => {
    try {
        const { eventSlug, userId } = req.body;

        // Validate required fields
        if (!eventSlug || !userId) {
            return res.status(400).json({ error: "eventSlug and userId are required" });
        }

        // Step 1: Find the event by slug
        const event = await Event.findOne({ where: { eventSlug } });

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        // Step 2: Find guest registration for this user and event
        const registration = await EventGuests.findOne({
            where: { eventId: event.id, userId },
            attributes: ["guestType"],
        });

        if (!registration) {
            return res.status(404).json({ error: "Registration not found for this user" });
        }

        // Step 3: Respond with event details + guest type
        res.status(200).json({
            result: "SUCCESS",
            event,
            guestType: registration.guestType, // ✅ returns just guestType
        });
    } catch (error) {
        console.error("Error fetching guest type:", error);
        res.status(500).json({ result: "ERROR", message: "Internal server error" });
    }
};


// GET /events/slug-availability?slug=<slug>
exports.checkSlugAvailability = async (req, res) => {
    try {
        const rawSlug = req.query.slug?.trim();

        if (!rawSlug) {
            return res.status(400).json({
                result: "ERROR",
                error: "Slug is required"
            });
        }

        const slug = toSlug(rawSlug);

        // Check if slug already exists (case-insensitive)
        const existing = await Event.findOne({
            where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('eventSlug')),
                slug.toLowerCase()
            ),
        });

        if (existing) {
            return res.status(200).json({
                result: "SUCCESS",
                available: false,
                slug,
                message: "URL already taken"
            });
        }

        return res.status(200).json({
            result: "SUCCESS",
            available: true,
            slug,
            message: "URL is available"
        });

    } catch (error) {
        console.error("Error checking slug availability:", error);
        return res.status(500).json({
            result: "ERROR",
            available: false,
            message: "Internal server error"
        });
    }
};

// GET /events/slug/:slug
exports.getEventBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        if (!slug) {
            return res.status(400).json({
                error: "eventSlug is required",
            });
        }

        const event = await Event.findOne({
            where: { eventSlug: slug },
        });

        if (!event) {
            return res.status(404).json({
                error: "Event not found",
            });
        }

        return res.status(200).json({
            result: "SUCCESS",
            event,
        });
    } catch (error) {
        console.error("Error fetching event by slug:", error);
        return res.status(500).json({
            result: "ERROR",
            message: "Internal server error",
        });
    }
};

//POST /events/user
exports.getUserEvents = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const data = await EventGuests.findAll({
            where: { userId },
            attributes: ['id', 'feedbackData', 'feedbackSubmittedAt', 'eventId', 'guestType', 'certificateApproved', 'certificateGenerated'],
            include: [
                {
                    model: Event,
                    as: 'event',
                    attributes: [
                        'eventTitle',
                        'eventSubtitle',
                        'eventStartDate',
                        'eventEndDate',
                        'eventStartTime',
                        'eventEndTime',
                        'tags',
                        'eventSlug',
                        'speakers',
                        'numberOfAttendees',
                        'eventType',
                        'locationType',
                        'canAcceptResponse'
                    ]
                },
            ],
            order: [[{ model: Event, as: 'event' }, 'eventStartDate', 'DESC']],
        });

        return res.status(200).json({
            result: "SUCCESS",
            data,
        });
    } catch (error) {
        console.error("Error fetching user events:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

//POST /event/user/feedback
exports.submitEventFeedback = async (req, res) => {
    try {
        const { userId, eventId, feedbackData } = req.body;

        if (!userId || !eventId || !feedbackData) {
            return res.status(400).json({ error: "userId, eventId, and feedbackData are required" });
        }

        if (typeof feedbackData !== 'object') {
            return res.status(400).json({ error: "feedbackData must be an object" });
        }

        if (Object.keys(feedbackData).length === 0) {
            return res.status(400).json({ error: "feedbackData cannot be empty" });
        }

        const event = await Event.findOne({ where: { id: eventId } });

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        if (!event.canAcceptResponse) {
            return res.status(404).json({ error: "This event is not accepting feedback at the moment." });
        }

        const eventGuest = await EventGuests.findOne({
            where: { userId, eventId, guestType: "Approved" },
        });

        if (!eventGuest) {
            return res.status(400).json({
                error: "Feedback can only be submitted by approved guests or no matching record found.",
            });
        }

        if (eventGuest.feedbackSubmittedAt) {
            return res.status(400).json({
                error: "Feedback already submitted for this event.",
            });
        }

        if (["Hackathon", "Teardown"].includes(event.eventType)) {
            feedbackData.isPrimaryMember = true;
        }

        const updateData = {
            feedbackData,
            feedbackSubmittedAt: new Date(),
        };

        await EventGuests.update(updateData, {
            where: { id: eventGuest.id },
        });

        return res.status(200).json({ result: "SUCCESS", message: "Feedback submitted successfully" });
    } catch (error) {
        console.error("Error submitting event feedback:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getEventTypeBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        if (!slug) {
            return res.status(400).json({
                error: "eventSlug is required",
            });
        }

        const event = await Event.findOne({
            where: { eventSlug: slug },
            attributes: ["id", "eventTitle", "eventType", "eventSlug"],
        });

        if (!event) {
            return res.status(404).json({
                error: "Event not found",
            });
        }

        return res.status(200).json({
            result: "SUCCESS",
            eventId: event.id,
            eventTitle: event.eventTitle,
            eventType: event.eventType,
            eventSlug: event.eventSlug,
        });
    } catch (error) {
        console.error("Error fetching event type by slug:", error);
        return res.status(500).json({
            result: "ERROR",
            message: "Internal server error",
        });
    }
};

exports.getFeedbackStatus = async (req, res) => {
    try {
        const { userId, eventId } = req.body;

        if (!userId || !eventId) {
            return res.status(400).json({
                result: "ERROR",
                message: "userId and eventId are required",
            });
        }

        const record = await EventGuests.findOne({
            where: { userId, eventId },
            attributes: ["feedbackData"],
        });

        // Check if feedbackData exists
        const hasFeedback = record && record.feedbackData ? true : false;

        return res.status(200).json({
            result: "SUCCESS",
            isFeedbackSubmitted: hasFeedback,
        });
    } catch (error) {
        console.error("🔥 Error in getFeedbackStatus:", error);
        return res.status(500).json({
            result: "ERROR",
            message: "Internal server error",
        });
    }
};

exports.getNearestEvent = async (req, res) => {
    try {
        // Get current time in your timezone (India)
        const now = moment().tz("Asia/Kolkata").toDate();

        // Find the event whose start date is nearest to now (future events only)
        const nearestEvent = await Event.findOne({
            where: {
                eventStartDate: {
                    [Op.gte]: now, // Only consider upcoming events
                },
            },
            attributes: { exclude: ["eventDetails"] },
            order: [["eventStartDate", "ASC"]], // Sort by soonest start date
        });

        if (!nearestEvent) {
            return res
                .status(404)
                .json({ result: "ERROR", message: "No upcoming events found" });
        }

        res.status(200).json({ result: "SUCCESS", nearestEvent });
    } catch (error) {
        console.error("Error fetching nearest event:", error);
        res
            .status(500)
            .json({ result: "ERROR", message: "Internal server error" });
    }
};

//GET /events/feedback/:eventId
exports.getEventFeedbacks = async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        const { eventId } = req.params;

        if (!eventId) {
            return res
                .status(400)
                .json({ success: false, message: "eventId is required" });
        }

        // 1. Fetch event type
        const event = await Event.findByPk(eventId, {
            attributes: ["eventType"],
        });

        if (!event) {
            return res
                .status(404)
                .json({ success: false, message: "Event not found" });
        }

        // 2. Build where clause
        const whereClause = {
            feedbackData: { [Op.ne]: null },
            feedbackSubmittedAt: { [Op.ne]: null },
        };

        // Only primary for Hackathon & Teardown 
        if (["Hackathon", "Teardown"].includes(event.eventType)) {
            whereClause[Op.and] = Sequelize.literal(
                `"EventGuests"."feedbackData"->>'isPrimaryMember' = 'true'`,
            );
        }

        const eventInclude = {
            model: Event,
            as: "event",
            attributes: [
                "id",
                "eventTitle",
                "eventType",
                "eventStartDate",
                "eventEndDate",
            ],
            where: { id: eventId },
        };

        const userInclude = {
            model: users,
            as: "user",
            attributes: ["id", "name", "email", "phone", "profile_picture"],
        };

        // 3. Paginated query
        const { count, rows } = await EventGuests.findAndCountAll({
            where: whereClause,
            attributes: [
                "id",
                "name",
                "phone",
                "feedbackData",
                "feedbackSubmittedAt",
                "certificateApproved",
                "certificateGenerated",
                "certificateGeneratedAt",
                "certificateId",
            ],
            include: [userInclude, eventInclude],
            order: [["feedbackSubmittedAt", "DESC"]],
            limit,
            offset,
            distinct: true,
        });

        // 4. Extract Team Member 2 emails and fetch their CURRENT data
        const teamMember2Emails = [
            ...new Set(rows.map((r) => r.feedbackData?.teamMember2Email).filter(Boolean)),
        ];


        let teamMember2DataMap = {};

        if (teamMember2Emails.length > 0) {
            const teamMembers = await users.findAll({
                where: { email: teamMember2Emails },
                attributes: ["id", "name", "email", "profile_picture"],
                include: [
                    {
                        model: EventGuests,
                        as: "EventGuests",
                        required: false,
                        where: {
                            eventId,
                            guestType: "Approved",
                        },
                        attributes: [
                            "id",
                            "userId",
                            "name",
                            "phone",
                            "certificateApproved",
                            "certificateGenerated",
                            "certificateGeneratedAt",
                            "certificateId",
                        ],
                    },
                ],
            });
            teamMember2DataMap = teamMembers.reduce((acc, userModel) => {
                const user = userModel.get({ plain: true });

                const guest = user.EventGuests?.[0] || null;

                delete user.EventGuests;

                acc[user.email] = {
                    user,
                    guest,
                };

                return acc;
            }, {});
        }

        // 5. Attach team member 2 data
        rows.forEach((row) => {
            const teamMembers = [];

            const email = row.feedbackData?.teamMember2Email;
            const secondaryData = email ? teamMember2DataMap[email] : null;

            if (secondaryData?.user && row.user) {
                const isSameUser =
                    secondaryData.user.id === row.user.id ||
                    secondaryData.user.email === row.user.email;

                if (!isSameUser) {
                    teamMembers.push({
                        user: secondaryData.user,
                        guest: secondaryData.guest,
                    });
                }
            }

            row.dataValues.teamMembers = teamMembers;
        });


        const meta = getMeta(count, page, limit);

        return res.status(200).json({
            success: true,
            meta,
            data: rows,
        });
    } catch (error) {
        console.error("Error fetching feedbacks:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch feedbacks",
            error: error.message,
        });
    }
};

//GET /events/feedback/:eventId/export
exports.exportEventFeedbacks = async (req, res) => {
    try {

        const { eventId } = req.params;
        if (!eventId) {
            return res.status(400).json({ success: false, message: "eventId is required" });
        }

        const whereClause = {
            feedbackData: { [Op.ne]: null },
            feedbackSubmittedAt: { [Op.ne]: null },
        };

        const eventInclude = {
            model: Event,
            as: "event",
            attributes: ["id", "eventTitle", "eventType", "eventStartDate", "eventEndDate"],
            where: { id: eventId },
        };

        const userInclude = { model: users, as: "user", attributes: ["id", "name", "email", "phone", "profile_picture"] };

        const data = await EventGuests.findAll({
            where: whereClause,
            attributes: [
                "id", "name", "phone", "feedbackData", "feedbackSubmittedAt",
                "certificateApproved", "certificateGenerated", "certificateGeneratedAt", "certificateId"
            ],
            include: [userInclude, eventInclude],
            order: [["feedbackSubmittedAt", "DESC"]],
            distinct: true
        });

        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Error exporting feedbacks:", error);
        return res.status(500).json({ success: false, message: "Failed to export feedbacks", error: error.message });
    }
};


// PATCH /api/events/:eventId/toggle-response
exports.toggleAcceptResponse = async (req, res) => {
    try {
        const { id } = req.params;
        const { canAcceptResponse } = req.body;

        // Validate input
        if (typeof canAcceptResponse !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'canAcceptResponse must be a boolean value',
            });
        }

        const event = await Event.findByPk(id);

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found',
            });
        }

        event.canAcceptResponse = canAcceptResponse;
        await event.save();

        return res.status(200).json({
            success: true,
            message: `Response acceptance ${canAcceptResponse ? 'enabled' : 'disabled'} successfully`,
            data: {
                eventId: event.id,
                canAcceptResponse: event.canAcceptResponse,
            },
        });

    } catch (error) {
        console.error('Error toggling accept response:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message,
        });
    }
};


exports.getWhatsappLinkBySlug = async (req, res) => {
    try {
        const { slug } = req.body;

        if (!slug) {
            return res.status(400).json({ error: "slug is required" });
        }

        // Fetch the event
        const event = await Event.findOne({
            where: { eventSlug: slug },
            attributes: ["eventDetails"]
        });

        if (!event) {
            return res.status(404).json({
                result: "FAILED",
                message: "Event not found"
            });
        }

        // Safely extract eventDetails (Sequelize)
        const details =
            typeof event.get === "function"
                ? event.get("eventDetails")
                : event.eventDetails;

        // Extract WhatsApp link
        const whatsappLink = details?.whatsappLink?.Link;

        if (!whatsappLink) {
            return res.status(404).json({
                result: "FAILED",
                message: "WhatsApp link not found for this event"
            });
        }

        return res.status(200).json({
            result: "SUCCESS",
            whatsappLink
        });

    } catch (error) {
        return res.status(500).json({
            result: "ERROR",
            message: "Internal server error"
        });
    }
};