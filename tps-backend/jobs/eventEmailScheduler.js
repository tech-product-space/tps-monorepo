const agenda = require("../config/agenda");

const { EventEmailTemplate, EventGuests, users } = require("../models");

const {
  EVENT_EMAIL_TARGET_TYPES,
  EVENT_EMAIL_TEMPLATE_STATUS,
  EVENT_EMAIL_TARGET_ROLES,
} = require("../constants/event");
const { capitalizeName } = require("../utils/capitalize");
const {
  wrapEmailTemplate,
  cleanHtml,
  replacePlaceholders,
} = require("../utils/email/htmlHelpers");
const { sendGraphEmail } = require("../utils/email/sendGraphEmail");

/* ------------------------------------------
   JOB CONFIG
------------------------------------------ */

const MAX_RETRIES = 3;
const RETRY_DELAY = "in 30 seconds";

const JOB_NAME = "send-event-email-template";

/* ------------------------------------------
   JOB DEFINITION
------------------------------------------ */

agenda.define(JOB_NAME, async (job) => {
  
  try {
    const { templateId } = job.attrs.data;
    
    console.log("📩 Sending event email template:", templateId);

    const template = await EventEmailTemplate.findByPk(templateId);

    if (!template) {
      console.log("❌ Template not found:", templateId);
      return;
    }

    // If already sent → skip
    if (template.status === EVENT_EMAIL_TEMPLATE_STATUS.SENT) {
      console.log("⚠️ Template already sent. Skipping...");
      return;
    }

    const whereClause = {
      eventId: template.eventId,
    };

    // Target guest type filter
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

    console.log("👥 Guests found:", guests.length);

    if (guests.length === 0) {
      console.log("⚠️ No guests to send email");
      return;
    }

    /* -------------------------------
       3. Send Emails 
    ------------------------------- */

    const cleanedBody = cleanHtml(template.body);

    for (const guest of guests) {
      try {
        const email = guest.user?.email;

        if (!email) continue;

        const recipientName = capitalizeName(
          guest.name || guest.user?.name || "Guest",
        );

        const personalizedSubject = replacePlaceholders(template.subject, {
          name: recipientName,
        });

        const personalizedBody = replacePlaceholders(cleanedBody, {
          name: recipientName,
        });

        const htmlContent = wrapEmailTemplate(personalizedBody);

        // Step 3: Send email
        await sendGraphEmail({
          to: email,
          subject: personalizedSubject,
          html: htmlContent,
        });

      } catch (error) {
        console.error(`Event ${template.templateName} Email failed for ${email}`, error.message);
        continue;
      }
    }

    /* -------------------------------
       4. Mark Template as Sent
    ------------------------------- */

    template.status = EVENT_EMAIL_TEMPLATE_STATUS.SENT;
    template.sentAt = new Date();

    await template.save();

    console.log("🎉 Template email campaign completed!");
  } catch (error) {
    console.error("❌ Event email job failed:", error.message);

    const attempts = job.attrs.failCount || 0;

    /* -------------------------------
       Retry Logic
    ------------------------------- */

    if (attempts < MAX_RETRIES) {
      console.log(`🔁 Retry attempt ${attempts + 1}/${MAX_RETRIES}`);

      await job.schedule(RETRY_DELAY).save();
    } else {
      console.log("🚨 Max retries reached. Marking template as FAILED.");

      // Mark template failed
      await EventEmailTemplate.update(
        { status: EVENT_EMAIL_TEMPLATE_STATUS.FAILED },
        { where: { id: templateId } },
      );
    }

    throw error;
  }
});

/* ------------------------------------------
   SCHEDULER FUNCTIONS
------------------------------------------ */

/**
 * Schedule Template Email Sending
 */
async function scheduleEventEmailTemplate(templateId, scheduledAt) {
  // Cancel existing schedule
  await agenda.cancel({
    name: JOB_NAME,
    "data.templateId": templateId,
  });

  console.log("Now:", new Date());
  console.log("Scheduled AT: ", scheduledAt);
  console.log("Coverted Scheduled AT: ", new Date(scheduledAt));
  

  // Schedule new job
  await agenda.schedule(new Date(scheduledAt), JOB_NAME, {
    templateId,
  });

  console.log("📌 Template scheduled:", templateId, scheduledAt);
}

/**
 * Cancel Scheduled Template
 */
async function cancelEventEmailTemplate(templateId) {
  const cancelledCount = await agenda.cancel({
    name: JOB_NAME,
    "data.templateId": templateId,
  });

  console.log("❌ Cancelled jobs:", cancelledCount);

  return cancelledCount;
}

module.exports = {
  scheduleEventEmailTemplate,
  cancelEventEmailTemplate,
};
