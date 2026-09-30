const { Event, EventEmailTemplate, EventGuests, users } = require("../models");
const {
  EVENT_EMAIL_TARGET_TYPES,
  EVENT_EMAIL_TEMPLATE_STATUS,
  EVENT_EMAIL_TARGET_ROLES,
} = require("../constants/event");

const {
  scheduleEventEmailTemplate,
  cancelEventEmailTemplate,
} = require("../jobs/eventEmailScheduler");
const {
  replacePlaceholders,
  cleanHtml,
  wrapEmailTemplate,
} = require("../utils/email/htmlHelpers.js");
const { capitalizeName } = require("../utils/capitalize.js");
const { sendGraphEmail } = require("../utils/email/sendGraphEmail");

module.exports = {
  //  POST /events/:eventId/email/template
  async createTemplate(req, res) {
    try {
      const { eventId } = req.params;
      const {
        templateName,
        subject,
        body,
        targetGuestType,
        targetGuestRole,
        scheduledAt,
      } = req.body;

      // Validate event exists
      const event = await Event.findByPk(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Validate guest type
      if (
        targetGuestType &&
        !Object.values(EVENT_EMAIL_TARGET_TYPES).includes(targetGuestType)
      ) {
        return res.status(400).json({
          message: "Invalid 'targetGuestType'",
        });
      }

      if (
        targetGuestRole &&
        !Object.values(EVENT_EMAIL_TARGET_ROLES).includes(targetGuestRole)
      ) {
        return res.status(400).json({
          message: "Invalid 'targetGuestRole'",
        });
      }

      // Decide status
      let status = EVENT_EMAIL_TEMPLATE_STATUS.DRAFT;

      if (scheduledAt) {
        status = EVENT_EMAIL_TEMPLATE_STATUS.SCHEDULED;
      }

      // Create template
      const template = await EventEmailTemplate.create({
        eventId,
        templateName,
        subject,
        body,
        targetGuestType: targetGuestType || EVENT_EMAIL_TARGET_TYPES.ALL,
        targetGuestRole: targetGuestRole || EVENT_EMAIL_TARGET_ROLES.ALL,
        scheduledAt: scheduledAt || null,
        status,
      });

      // If scheduledAt provided → schedule agenda job
      if (scheduledAt) {
        await scheduleEventEmailTemplate(template.id, scheduledAt);
      }

      res.status(201).json({
        message: "Email template created successfully",
        template,
      });
    } catch (error) {
      console.error("❌ Create template error:", error.message);

      res.status(500).json({
        message: "Something went wrong",
        error: error.message,
      });
    }
  },

  //  GET /events/:eventId/email/templates
  async getTemplates(req, res) {
    try {
      const { eventId } = req.params;

      const templates = await EventEmailTemplate.findAll({
        where: { eventId },
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        message: "Templates fetched successfully",
        templates,
      });
    } catch (error) {
      console.error("❌ Fetch templates error:", error.message);

      res.status(500).json({
        message: "Failed to fetch templates",
        error: error.message,
      });
    }
  },

  //  GET /events/email/template/:templateId
  async getTemplateById(req, res) {
    try {
      const { templateId } = req.params;

      const template = await EventEmailTemplate.findByPk(templateId);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.status(200).json({
        message: "Template fetched successfully",
        template,
      });
    } catch (error) {
      console.error("❌ Fetch template error:", error.message);

      res.status(500).json({
        message: "Failed to fetch template",
        error: error.message,
      });
    }
  },

  //  PUT /events/email/template/:templateId
  async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { templateName, subject, body, targetGuestType, targetGuestRole } =
        req.body;

      const template = await EventEmailTemplate.findByPk(templateId);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Validate guest type
      if (
        targetGuestType &&
        !Object.values(EVENT_EMAIL_TARGET_TYPES).includes(targetGuestType)
      ) {
        return res.status(400).json({
          message: "Invalid 'targetGuestType'",
        });
      }

      if (
        targetGuestRole &&
        !Object.values(EVENT_EMAIL_TARGET_ROLES).includes(targetGuestRole)
      ) {
        return res.status(400).json({
          message: "Invalid 'targetGuestRole'",
        });
      }

      // Update fields
      template.templateName = templateName || template.templateName;
      template.subject = subject || template.subject;
      template.body = body || template.body;
      template.targetGuestType = targetGuestType || template.targetGuestType;
      template.targetGuestRole = targetGuestRole || template.targetGuestRole;

      await template.save();

      res.status(200).json({
        message: "Template updated successfully",
        template,
      });
    } catch (error) {
      console.error("❌ Update template error:", error.message);

      res.status(500).json({
        message: "Failed to update template",
        error: error.message,
      });
    }
  },

  //  DELETE /events/email/template/:templateId
  async deleteTemplate(req, res) {
    try {
      const { templateId } = req.params;

      const template = await EventEmailTemplate.findByPk(templateId);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      await template.destroy();

      res.status(200).json({
        message: "Template deleted successfully",
      });
    } catch (error) {
      console.error("❌ Delete template error:", error.message);

      res.status(500).json({
        message: "Failed to delete template",
        error: error.message,
      });
    }
  },

  // POST /events/email/template/:templateId/schedule
  async scheduleTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { scheduledAt } = req.body;

      const template = await EventEmailTemplate.findByPk(templateId);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      template.scheduledAt = scheduledAt;
      template.status = EVENT_EMAIL_TEMPLATE_STATUS.SCHEDULED;

      await template.save();

      // Schedule Agenda job
      await scheduleEventEmailTemplate(template.id, scheduledAt);

      res.status(200).json({
        message: "Template scheduled successfully",
        scheduledAt,
      });
    } catch (error) {
      console.error("❌ Schedule template error:", error.message);

      res.status(500).json({
        message: "Failed to schedule template",
        error: error.message,
      });
    }
  },

  //POST /events/email/template/:templateId/cancel
  async cancelSchedule(req, res) {
    try {
      const { templateId } = req.params;

      const template = await EventEmailTemplate.findByPk(templateId);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Only cancel if scheduled
      if (!template.scheduledAt) {
        return res.status(400).json({
          message: "Template is not scheduled",
        });
      }

      // Cancel job
      await cancelEventEmailTemplate(templateId);

      // Reset template fields
      template.status = EVENT_EMAIL_TEMPLATE_STATUS.DRAFT;
      template.scheduledAt = null;
      template.sentAt = null;

      await template.save();

      res.status(200).json({
        message: "Scheduled email cancelled successfully",
      });
    } catch (error) {
      console.error("❌ Cancel schedule error:", error.message);

      res.status(500).json({
        message: "Failed to cancel schedule",
        error: error.message,
      });
    }
  },

  // POST /events/email/template/:templateId/test
  async sendTestEmail(req, res) {
    try {
      const { templateId } = req.params;
      const { email, name } = req.body;

      if (!email) {
        return res.status(400).json({
          message: "Test email address is required",
        });
      }

      const template = await EventEmailTemplate.findByPk(templateId);

      if (!template) {
        return res.status(404).json({
          message: "Template not found",
        });
      }

      const recipientName = capitalizeName(
        name || "there",
      );

      const personalizedSubject = replacePlaceholders(template.subject, {
        name: recipientName,
      });

      const htmlContent = wrapEmailTemplate(
        cleanHtml(replacePlaceholders(template.body, { name: recipientName })),
      );

      await sendGraphEmail({
        to: email,
        subject: personalizedSubject,
        html: htmlContent,
      });

      return res.status(200).json({
        message: "Test email sent successfully",
      });
    } catch (error) {
      console.error("❌ Send test email error:", error);

      return res.status(500).json({
        message: "Failed to send test email",
        error: error.message,
      });
    }
  },

  // POST /events/email/template/sendEmailNow
  async sendReminderEmailNow(req, res) {
  try {
    const { templateId } = req.body;

    const template = await EventEmailTemplate.findByPk(templateId);

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Build guest filter
    const whereClause = { eventId: template.eventId };

    if (template.targetGuestType !== EVENT_EMAIL_TARGET_TYPES.ALL) {
      whereClause.guestType = template.targetGuestType;
    }

    if (template.targetGuestRole !== EVENT_EMAIL_TARGET_ROLES.ALL) {
      whereClause.userType = template.targetGuestRole;
    }

    const guests = await EventGuests.findAll({
      where: whereClause,
      include: [
        {
          model: users,
          as: "user",
          attributes: ["email", "name"],
        },
      ],
    });

    if (guests.length === 0) {
      return res.status(400).json({ message: "No guests found for this template" });
    }

    const cleanedBody = cleanHtml(template.body);
    const failedEmails = [];

    for (const guest of guests) {
      try {
        const email = guest.user?.email;
        if (!email) continue;

        const recipientName = capitalizeName(
          guest.name || guest.user?.name || "Guest"
        );

        const personalizedSubject = replacePlaceholders(template.subject, {
          name: recipientName,
        });

        const personalizedBody = replacePlaceholders(cleanedBody, {
          name: recipientName,
        });

        const htmlContent = wrapEmailTemplate(personalizedBody);

        await sendGraphEmail({
          to: email,
          subject: personalizedSubject,
          html: htmlContent,
        });
      } catch (error) {
        console.error(
          `Event ${template.templateName} Email failed for ${guest.user?.email}`,
          error.message
        );
        failedEmails.push(guest.user?.email);
        continue;
      }
    }

    // If any scheduled agenda job exists for this template, cancel it
    const JOB_NAME = "send-event-email-template";
    
    await agenda.cancel({
      name: JOB_NAME,
      "data.templateId": template.id,
    });

    // Mark as sent
    template.status = EVENT_EMAIL_TEMPLATE_STATUS.SENT;
    template.sentAt = new Date();
    template.scheduledAt = null; // clear any prior schedule

    await template.save();

    return res.status(200).json({
      message: "Template sent successfully",
      totalGuests: guests.length,
      failedEmails,
    });
  } catch (error) {
    console.error("❌ Send now error:", error.message);

    return res.status(500).json({
      message: "Failed to send template",
      error: error.message,
    });
  }
  },
};
