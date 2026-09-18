const agenda = require("../config/agenda");
const { Campaign, CampaignRecipient, sequelize } = require("../models");
const {
  CAMPAIGN_STATUS,
  CAMPAIGN_RECIPIENT_STATUS,
} = require("../constants/campaign");

const sendEmail = require("../service/mail/sendEmail");
const {
  generateUnsubscribeToken,
} = require("../service/campaign/emailUnsubscribeToken");

const {
  wrapEmailTemplate,
  wrapEmailTemplateWithUnsubscribe,
  cleanHtml,
  replacePlaceholders,
} = require("../utils/email/htmlHelpers");
const { capitalizeName } = require("../utils/capitalize");
const {
  buildRecipients,
} = require("../service/campaign/campaignRecipientBuilder");
const {
  filterUnsubscribedRecipients,
} = require("../service/campaign/filterUnsubscribedRecipients");

const MAX_RETRIES = 1;
const RETRY_DELAY = "in 2 minutes";
const BATCH_SIZE = 50;

const isDev = process.env.NODE_ENV === "production";
const log = (...args) => isDev && console.log("[Campaign Job]", ...args);
const logError = (...args) =>
  isDev && console.error("[Campaign Job ERROR]", ...args);

/* ------------------------------------------
   JOB DEFINITION
------------------------------------------ */

agenda.define("send-campaign", async (job) => {
  const { campaignId } = job.attrs.data;

  log(`🚀 Job started for campaignId: ${campaignId}`);

  try {
    const campaign = await Campaign.findByPk(campaignId);

    if (!campaign) {
      log(`⚠️  Campaign ${campaignId} not found, skipping.`);
      return;
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
      throw new Error("Campaign missing required fields");
    }

    log(`✅ Campaign ${campaignId} validated. Subject: "${campaign.subject}"`);

    const existingRecipients = await CampaignRecipient.count({
      where: { campaign_id: campaignId },
    });

    log(`👥 Existing recipients in DB: ${existingRecipients}`);

    if (!existingRecipients) {
      log(`🔨 Building recipients from filters...`);

      const recipients = await buildRecipients(campaign.recipient_filters);
      const filteredRecipients = await filterUnsubscribedRecipients(recipients);

      if (!filteredRecipients?.length) {
        throw new Error("No recipients found for campaign");
      }

      log(
        `📋 ${filteredRecipients.length} recipients built, inserting into DB...`,
      );

      await CampaignRecipient.bulkCreate(
        filteredRecipients.map((r) => ({
          campaign_id: campaignId,
          email: r.email,
          name: r.name,
          phone: r.phone,
          source_type: r.source_type,
          source_id: r.source_id,
          status: CAMPAIGN_RECIPIENT_STATUS.PENDING,
        })),
      );

      log(`✅ Recipients inserted successfully.`);
    }

    /* --------------------------------
       UPDATE STATUS
    -------------------------------- */

    await campaign.update({ status: CAMPAIGN_STATUS.SENDING });
    log(`📤 Campaign ${campaignId} status → SENDING`);

    /* --------------------------------
       SEND EMAILS IN BATCHES
    -------------------------------- */

    const cleanedBody = cleanHtml(campaign.content);
    let batchNumber = 0;
    let totalSent = 0;
    let totalFailed = 0;

    while (true) {
      // Claim Batch
      const recipients = await sequelize.transaction(async (t) => {
        const rows = await CampaignRecipient.findAll({
          where: {
            campaign_id: campaignId,
            status: CAMPAIGN_RECIPIENT_STATUS.PENDING,
          },
          limit: BATCH_SIZE,
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (!rows.length) return [];

        await CampaignRecipient.update(
          { status: CAMPAIGN_RECIPIENT_STATUS.PROCESSING },
          {
            where: { id: rows.map((r) => r.id) },
            transaction: t,
          },
        );

        return rows;
      });

      if (!recipients.length) {
        log(`✅ No more pending recipients. Exiting batch loop.`);
        break;
      }

      batchNumber++;
      log(
        `📦 Batch #${batchNumber}: processing ${recipients.length} recipients...`,
      );

      for (const recipient of recipients) {
        try {
          const recipientName = capitalizeName(recipient.name || "User");
          const personalizedSubject = replacePlaceholders(campaign.subject, {
            name: recipientName,
          });

          const personalizedBody = replacePlaceholders(cleanedBody, {
            name: recipientName,
          });

          const token = generateUnsubscribeToken(recipient.email, campaign.id);

          const unsubscribeUrl = `${process.env.FRONTEND_URL}/unsubscribe?token=${token}&type=campaign`;

          let htmlContent;

          if (
            campaign.sender_email === "info@thegradient.co.in" ||
            campaign.sender_email === "noreply@gradientlearnings.org"
          ) {
            htmlContent = wrapEmailTemplate(personalizedBody);
          } else {
            htmlContent = wrapEmailTemplateWithUnsubscribe(
              personalizedBody,
              unsubscribeUrl,
            );
          }

          const result = await sendEmail({
            to: recipient.email,
            subject: personalizedSubject,
            html: htmlContent,
            from: campaign.sender_email,
            fromName: campaign.sender_name,
          });

          if (result === "success") {
            await recipient.update({
              status: CAMPAIGN_RECIPIENT_STATUS.SENT,
              sent_at: new Date(),
            });

            totalSent++;
            log(`✉️  Sent → ${recipient.email}`);
          } else {
            throw new Error(
              `Failure from ${campaign.sender_email} Email Provider`,
            );
          }
        } catch (error) {
          await recipient.update({
            status: CAMPAIGN_RECIPIENT_STATUS.FAILED,
            error: error.message,
          });

          totalFailed++;
          logError(
            `  ❌ Failed → ${recipient.email} | Reason: ${error.message}`,
          );
        }
      }

      log(
        `📊 Batch #${batchNumber} done. Sent: ${totalSent} | Failed: ${totalFailed}`,
      );
    }

    /* --------------------------------
       MARK CAMPAIGN SENT
    -------------------------------- */

    await campaign.update({
      status: CAMPAIGN_STATUS.SENT,
      sent_at: new Date(),
    });
    log(
      `🎉 Campaign ${campaignId} complete. Total sent: ${totalSent}, failed: ${totalFailed}`,
    );
  } catch (error) {
    const attempts = job.attrs.failCount || 0;
    logError(
      `💥 Job failed for campaign ${campaignId}. Attempt: ${attempts + 1}/${MAX_RETRIES}`,
    );
    logError(`   Reason: ${error.message}`);

    if (attempts < MAX_RETRIES) {
      log(`🔁 Retrying campaign ${campaignId} ${RETRY_DELAY}...`);
      await job.schedule(RETRY_DELAY).save();
    } else {
      logError(
        `🚨 Campaign ${campaignId} exceeded max retries. Marking as FAILED.`,
      );
      await Campaign.update(
        { status: CAMPAIGN_STATUS.FAILED },
        { where: { id: campaignId } },
      );
    }

    throw error;
  }
});

/* ------------------------------------------
   SCHEDULER FUNCTIONS
------------------------------------------ */

async function scheduleCampaign(campaignId, scheduleAt) {
  log(`📅 Scheduling campaign ${campaignId} at ${scheduleAt}`);

  await agenda.cancel({ name: "send-campaign", "data.campaignId": campaignId });
  await agenda.schedule(new Date(scheduleAt), "send-campaign", { campaignId });

  log(`✅ Campaign ${campaignId} scheduled.`);
}

async function sendCampaignNow(campaignId) {
  log(`⚡ Dispatching campaign ${campaignId} immediately.`);
  await agenda.cancel({ name: "send-campaign", "data.campaignId": campaignId });
  await agenda.now("send-campaign", { campaignId });
}

async function cancelCampaignSchedule(campaignId) {
  log(`🛑 Cancelling scheduled job for campaign ${campaignId}`);
  return agenda.cancel({
    name: "send-campaign",
    "data.campaignId": campaignId,
  });
}

module.exports = { scheduleCampaign, sendCampaignNow, cancelCampaignSchedule };
