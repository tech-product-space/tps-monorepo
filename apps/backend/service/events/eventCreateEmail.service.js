const { users, Event, EmailTemplate } = require("../../models");
const {
  wrapEmailTemplate,
  cleanHtml,
  replacePlaceholders,
} = require("../../utils/email/htmlHelpers");
const {
  sendEmailWithCalendarInviteStaging,
} = require("../../utils/email/sendCalendarEmail");
const { sendGraphEmail } = require("../../utils/email/sendGraphEmail");

exports.triggerEventCreatedEmail = async ({ userId, eventId, guestType, userType }) => {
  const event = await Event.findByPk(eventId);
  if (!event) {
    throw new Error(`Event not found for ID ${eventId}`);
  }

  let type = "Pending";

  if (["Teardown", "Hackathon"].includes(event.eventType)) {
    type = "Registered";
  } else if (guestType === "Approved") {
    type = "Approved";
  }

  let template = null;

  // Registered (Teardown/Hackathon) emails can have user-type-specific
  // templates; fall back to the default "Registered" template when none exists
  if (type === "Registered" && ["Student", "Professional"].includes(userType)) {
    template = await EmailTemplate.findOne({
      where: { eventId, type: `Registered_${userType}` },
    });
  }

  if (!template) {
    template = await EmailTemplate.findOne({
      where: { eventId, type },
    });
  }

  if (!template) {
    throw new Error(`No template found for type: ${type}`);
  }

  const user = await users.findByPk(userId);
  if (!user) {
    throw new Error("No user found with provided ID");
  }

  const htmlContent = wrapEmailTemplate(
    cleanHtml(
      replacePlaceholders(template.body, {
        name: user.name,
      })
    )
  );

  if (type === "Pending") {
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
};
