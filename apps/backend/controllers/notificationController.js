const { users, Event, ReferralCode, EmailTemplate } = require("../models");
const { Op } = require("sequelize");
const { sendGraphEmail } = require("../utils/email/sendGraphEmail");
const { sendEmailWithCalendarInvite, sendEmailWithCalendarInviteStaging } = require("../utils/email/sendCalendarEmail");
const templateMap = require("../utils/templates/notificationTemplates");

function generateReferralCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return [...Array(length)]
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join('');
}

// Replace {{placeholders}} in email body
const replacePlaceholders = (body, replacements) => {
  const withValues = body.replace(/{{(.*?)}}/g, (_, key) => {
    return replacements[key.trim()] ?? "";
  });

  // Convert newlines to <br> for HTML emails
  return withValues.replace(/\n/g, "<br>");
};

const cleanHtml = (html) => {
  return html
    .replace(/white-space:\s*pre-wrap;?/g, "")
    .replace(/white-space:\s*pre;?/g, "")
    .replace(/<p\b[^>]*>/gi, "<div>")   // replace opening <p ...> with <div>
    .replace(/<\/p>/gi, "</div>");       // replace closing </p> with </div>
};


const wrapEmailTemplate = (content) => {
  return `
  <style>
    @media only screen and (max-width: 600px) {
      .tps-pad { padding-left: 0 !important; padding-right: 0 !important; }
    }
  </style>

  <div style="background-color: #f3f4f6; width: 100%;">
    <div class="tps-pad" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 24px; font-size: 14px; font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      ${content}
    </div>
  </div>
  `;
};

exports.sendNotification = async (req, res) => {
  try {
    const { type, userIds, eventId } = req.body;

    if (!userIds || userIds.length === 0) {
      return res.status(400).json({ error: "No user ID(s) provided." });
    }

    const templateFn = templateMap[type];

    // Fetch email template from DB
    // const template = await EmailTemplate.findOne({
    //   where: { eventId, type },
    // });

    if (!templateFn) {
      return res.status(400).json({ error: `Unknown notification type: ${type}` });
    }

    // console.log(template.body);

    const event = await Event.findByPk(eventId);

    if (!event || !event.eventDetails) {
      return res.status(404).json({ error: `Event or eventDetails not found for ID ${eventId}` });
    }

    let emailData;

    if (type === "HackathonEmail") {
      emailData = event.eventDetails["registerEmail"];
    } else {
      emailData = event.eventDetails[type];
    }

    if (!emailData || !emailData.subject || !emailData.emailEventName) {
      return res.status(404).json({
        error: `Missing email content for type '${type}' in eventDetails`,
      });
    }

    const { subject, emailEventName, date } = emailData;

    const foundUsers = await users.findAll({
      where: {
        id: {
          [Op.in]: userIds,
        },
      },
    });

    if (foundUsers.length === 0) {
      return res.status(404).json({ error: "No users found with provided IDs." });
    }

    for (const user of foundUsers) {
      const [referral, created] = await ReferralCode.findOrCreate({
        where: { userId: user.id },
        defaults: { code: generateReferralCode() },
      });
      const htmlContent = templateFn({
        name: user.name,
        eventName: emailEventName,
        noOfPeople: event.eventDetails.waitlistEmail?.noOfSeats || "",
        whatsappGroupLink: event.eventDetails.whatsappLink?.Link || "",
        date: date,
        referralLink: `https://theproductspace.in/events/${event.eventTitle.replace(/\s+/g, "-")}?referralcode=${referral.code}`,
      });

      if (type == "waitlistEmail") {
        await sendGraphEmail({
          to: user.email,
          subject,
          html: htmlContent,
        });
      } else if (type == "HackathonEmail") {
        const requestbody = {
          title: event.eventTitle,
          description: event.eventSubtitle,
          eventStartDate: event.eventDetails.registerEmail?.date,
          eventEndDate: event.eventDetails.registerEmail?.date,
          eventStartTime: event.eventStartTime,
          eventEndTime: event.eventEndTime,
          location: event.locationType,
          attendees: []
        }
        await sendEmailWithCalendarInvite({
          to: user.email,
          subject,
          html: htmlContent,
          calendarEvent: requestbody
        });
      } else {
        const requestbody = {
          title: event.eventTitle,
          description: event.eventSubtitle,
          eventStartDate: event.eventStartDate,
          eventEndDate: event.eventEndDate,
          eventStartTime: event.eventStartTime,
          eventEndTime: event.eventEndTime,
          location: event.locationType,
          attendees: []
        }
        await sendEmailWithCalendarInvite({
          to: user.email,
          subject,
          html: htmlContent,
          calendarEvent: requestbody
        });
      }
    }

    res.status(200).json({ message: `Emails sent to ${foundUsers.length} user(s).` });
  } catch (error) {
    console.error("Error sending notification emails:", error);
    res.status(500).json({ error: "Failed to send emails", details: error.message });
  }
};

exports.sendTestNotification = async (req, res) => {
  try {
    const { type, userIds, eventId } = req.body;

    if (!userIds || userIds.length === 0) {
      return res.status(400).json({ error: "No user ID(s) provided." });
    }

    const template = await EmailTemplate.findOne({
      where: { eventId, type },
    });

    if (!template) {
      return res.status(400).json({ error: `No template found for type: ${type}` });
    }

    const event = await Event.findByPk(eventId);

    if (!event || !event.eventDetails) {
      return res.status(404).json({ error: `Event or eventDetails not found for ID ${eventId}` });
    }

    const foundUsers = await users.findAll({
      where: {
        id: { [Op.in]: userIds },
      },
    });

    if (foundUsers.length === 0) {
      return res.status(404).json({ error: "No users found with provided IDs." });
    }

    for (const user of foundUsers) {
      // replace placeholders in template body
      const htmlContent = wrapEmailTemplate(
        cleanHtml(
          replacePlaceholders(template.body, {
            name: user.name
          })
        )
      );

      if (type === "Pending" || type === "Declined") {
        await sendGraphEmail({
          to: user.email,
          subject: template.subject,
          html: htmlContent,
        });
      } else {
        const calendarEvent = {
          title: event.eventTitle,
          description: event.eventSubtitle || "",
          eventStartDate: template.date,
          eventEndDate: template.date,
          eventStartTime: template.startTime,
          eventEndTime: template.endTime,
          location: event.location || "",
          attendees: [user.email],
        };

        await sendEmailWithCalendarInviteStaging({
          to: user.email,
          subject: template.subject || event.eventTitle,
          html: htmlContent,
          calendarEvent,
        });
      }
    }

    res.status(200).json({ message: `Emails sent to ${foundUsers.length} user(s).` });
  } catch (error) {
    console.error("Error sending notification emails:", error);
    res.status(500).json({ error: "Failed to send emails", details: error.message });
  }
};

