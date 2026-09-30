"use strict";

const { CAMPAIGN_STATUS } = require("../../constants/campaign");
const { Sequelize, Op } = require("sequelize");
const {
  Campaign,
  CampaignRecipient,
  Event,
  EventGuests,
  Resource,
  ResourceLead,
  sequelize,
} = require("../../models");

const {
  buildRecipients,
} = require("../../service/campaign/campaignRecipientBuilder");
const {
  sendCampaignNow,
  scheduleCampaign,
  cancelCampaignSchedule,
} = require("../../jobs/campaignScheduler");

const sendEmail = require("../../service/mail/sendEmail");
const {
  cleanHtml,
  replacePlaceholders,
  wrapEmailTemplate,
} = require("../../utils/email/htmlHelpers");

const { filterUnsubscribedRecipients } = require("../../service/campaign/filterUnsubscribedRecipients");


exports.createCampaign = async (req, res) => {
  try {
    const { name, type = "email" } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Campaign name is required",
      });
    }

    const campaign = await Campaign.create({
      name,
      type,
      status: CAMPAIGN_STATUS.DRAFT,
    });

    return res.status(201).json({
      message: "Campaign created successfully",
      campaign,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create campaign",
    });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.findAll({
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      campaigns,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch campaigns",
    });
  }
};

exports.getCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findByPk(id);

    if (!campaign) {
      return res.status(404).json({
        message: "Campaign not found",
      });
    }

    return res.json({
      campaign,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch campaign",
    });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findByPk(id);

    if (!campaign) {
      return res.status(404).json({
        message: "Campaign not found",
      });
    }

    const oldFilters = JSON.stringify(campaign.recipient_filters);
    const newFilters = JSON.stringify(req.body.recipient_filters);

    await campaign.update(req.body);

    /* --------------------------------
       If filters changed, rebuild recipients
    -------------------------------- */

    if (req.body.recipient_filters && oldFilters !== newFilters) {
      await CampaignRecipient.destroy({
        where: { campaign_id: id },
      });
    }

    return res.json({
      message: "Campaign updated successfully",
      campaign,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update campaign",
    });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findByPk(id);

    if (!campaign) {
      return res.status(404).json({
        message: "Campaign not found",
      });
    }

    await campaign.destroy();

    return res.json({
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to delete campaign",
    });
  }
};

exports.schedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduled_at } = req.body;

    const campaign = await Campaign.findByPk(id);

    if (!campaign) {
      return res.status(404).json({
        message: "Campaign not found",
      });
    }

    /* --------------------------------
       VERIFY REQUIRED DATA
    -------------------------------- */

    if (
      !campaign.subject ||
      !campaign.content ||
      !campaign.sender_email ||
      !campaign.recipient_filters
    ) {
      return res.status(400).json({
        message:
          "Campaign is incomplete. Please fill subject, content, sender and filters.",
      });
    }

    /* --------------------------------
       SEND NOW
    -------------------------------- */

    if (!scheduled_at) {
      await sendCampaignNow(campaign.id);
      await campaign.update({
        status: CAMPAIGN_STATUS.SENDING,
        scheduled_at: null,
      });

      return res.json({
        message: "Campaign started successfully",
      });
    }

    /* --------------------------------
       SCHEDULE CAMPAIGN
    -------------------------------- */

    const scheduleTime = new Date(scheduled_at);

    if (scheduleTime <= new Date()) {
      return res.status(400).json({
        message: "Scheduled time must be in the future",
      });
    }

    await scheduleCampaign(campaign.id, scheduleTime);

    await campaign.update({
      status: CAMPAIGN_STATUS.SCHEDULED,
      scheduled_at: scheduleTime,
    });

    return res.json({
      message: "Campaign scheduled successfully",
      scheduled_at: scheduleTime,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to schedule campaign",
    });
  }
};

exports.cancelCampaignSchedule = async (req, res) => {
  const { id } = req.params;

  await cancelCampaignSchedule(id);

  await Campaign.update(
    { status: CAMPAIGN_STATUS.DRAFT, scheduled_at: null },
    { where: { id } },
  );

  res.json({ message: "Campaign scheduling cancelled" });
};

exports.previewRecipients = async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id);

  const recipients = await buildRecipients(campaign.recipient_filters);
  const filteredRecipients = await filterUnsubscribedRecipients(recipients);

  res.json({
    campaign,
    recipientsCount: recipients.length,
    recipients: filteredRecipients,
  });
};

exports.sendTestMail = async (req, res) => {
  const { email, name } = req.body;

  const campaign = await Campaign.findByPk(req.params.id);

  const cleanedBody = cleanHtml(campaign.content);

  const subject = replacePlaceholders(campaign.subject, { name });
  const body = replacePlaceholders(cleanedBody, { name });

  const htmlContent = wrapEmailTemplate(body);

  await sendEmail({
    to: email,
    subject,
    html: htmlContent,
    from: campaign.sender_email,
    fromName: campaign.sender_name,
    meta: {
      source: "CAMPAIGN",
      sourceId: campaign.id,
      sourceName: `Test: ${campaign.name || campaign.subject || "Campaign"}`,
      extra: { isTest: true },
    },
  });

  res.json({ message: "Test email sent" });
};

exports.getEventsForCampaign = async (req, res) => {
  try {
    const events = await Event.findAll({
      attributes: [
        "id",
        "eventTitle",
        "eventType",
        "eventCategory",

        // Total guests
        [Sequelize.fn("COUNT", Sequelize.col("guests.id")), "totalGuests"],

        // Approved
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.literal(
              `CASE WHEN guests."guestType" = 'Approved' THEN 1 END`,
            ),
          ),
          "approvedGuests",
        ],

        // Declined
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.literal(
              `CASE WHEN guests."guestType" = 'Declined' THEN 1 END`,
            ),
          ),
          "declinedGuests",
        ],

        // Waitlisted
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.literal(
              `CASE WHEN guests."guestType" = 'Waitlist' THEN 1 END`,
            ),
          ),
          "waitlistedGuests",
        ],
      ],

      include: [
        {
          model: EventGuests,
          as: "guests",
          attributes: [],
        },
      ],

      group: ["Event.id"],
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      events,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch events",
    });
  }
};


exports.getResourcesForCampaign = async (req, res) => {
  try {
    /* --------------------------------
       1. Fetch resources with lead count
    -------------------------------- */

    const resources = await Resource.findAll({
      attributes: [
        "id",
        "title",
        "resourceType",
        "resourceCategory",
        [sequelize.fn("COUNT", sequelize.col("leads.id")), "leadCount"],
      ],
      include: [
        {
          model: ResourceLead,
          as: "leads",
          attributes: [],
          required: false,
        },
      ],
      group: ["Resource.id"],
      order: [["title", "ASC"]],
      raw: true,
    });

    /* --------------------------------
       2. Distinct resource types
    -------------------------------- */

    const typesRaw = await Resource.findAll({
      attributes: [
        [
          sequelize.fn("DISTINCT", sequelize.col("resourceType")),
          "resourceType",
        ],
      ],
      where: {
        resourceType: { [Op.ne]: null },
      },
      raw: true,
    });

    /* --------------------------------
       3. Distinct resource categories
    -------------------------------- */

    const categoriesRaw = await Resource.findAll({
      attributes: [
        [
          sequelize.fn("DISTINCT", sequelize.col("resourceCategory")),
          "resourceCategory",
        ],
      ],
      where: {
        resourceCategory: { [Op.ne]: null },
      },
      raw: true,
    });

    /* --------------------------------
       4. Distinct job titles from resource leads
    -------------------------------- */

    const jobTitlesRaw = await ResourceLead.findAll({
      attributes: ["jobTitle"],
      where: {
        jobTitle: { [Op.ne]: null },
      },
      group: ["jobTitle"],
      raw: true,
    });

    /* --------------------------------
       5. Format resources
    -------------------------------- */

    const data = resources.map((r) => ({
      id: r.id,
      title: r.title,
      resourceType: r.resourceType,
      resourceCategory: r.resourceCategory,
      leadCount: parseInt(r.leadCount, 10) || 0,
    }));

    /* --------------------------------
       6. Format filter options
    -------------------------------- */

    const resourceTypes = typesRaw.map((t) => t.resourceType).filter(Boolean);

    const resourceCategories = categoriesRaw
      .map((c) => c.resourceCategory)
      .filter(Boolean);

    const jobTitles = jobTitlesRaw.map((j) => j.jobTitle).filter(Boolean);

    /* --------------------------------
       7. Response
    -------------------------------- */

    return res.status(200).json({
      success: true,
      data,
      resourceTypes,
      resourceCategories,
      jobTitles,
    });
  } catch (error) {
    console.error("[getResourcesForCampaign]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch resources.",
      error: error.message,
    });
  }
};
