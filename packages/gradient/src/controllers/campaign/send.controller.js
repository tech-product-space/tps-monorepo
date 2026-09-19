import db from "../../database/postgres/models/index.js";
import {
  CAMPAIGN_RECIPIENT_STATUS,
  CAMPAIGN_STATUS,
} from "../../config/constants/campaign.js";
import {
  cancelCampaignSchedule,
  composeCampaignEmail,
  scheduleCampaign,
  sendCampaignNow,
} from "../../jobs/campaignSendJob.js";
import { sendMail } from "../../services/email/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import logger from "../../util/logger.js";

const { Campaign, CampaignRecipient } = db;

/**
 * Everything that must be set before a campaign may go out.
 *
 * The panel shows the same list as red crosses on the editor cards; this is the
 * server-side copy, because the panel's version is a convenience and this one
 * is the guarantee.
 */
const readinessErrors = (campaign) => {
  const missing = [];

  if (!campaign.senderEmail) missing.push("Sender");
  if (!campaign.subject) missing.push("Subject");
  if (!campaign.body) missing.push("Email");

  const include =
    campaign.recipientFilters?.include ??
    campaign.recipientFilters?.sources ??
    [];

  if (!Array.isArray(include) || !include.length) missing.push("Recipients");

  return missing;
};

/**
 * SCHEDULE OR SEND NOW
 *
 * One route for both, because they are one decision made in one dialog. Omit
 * `scheduledAt` to send immediately.
 *
 * `verbFrom` in the activity registry splits them apart in the log — "scheduled
 * a campaign" and "sent a campaign" should not read the same.
 */
export const schedule = asyncWrapper(async (req, res) => {
  const { scheduledAt } = req.body;

  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  if (
    campaign.status === CAMPAIGN_STATUS.PROCESSING ||
    campaign.status === CAMPAIGN_STATUS.SENT
  ) {
    return res.status(400).json({
      message:
        campaign.status === CAMPAIGN_STATUS.PROCESSING
          ? "Campaign is already sending"
          : "Campaign has already been sent",
    });
  }

  const missing = readinessErrors(campaign);

  if (missing.length) {
    return res.status(400).json({
      message: `Campaign is not ready: ${missing.join(", ")}`,
      data: { missing },
    });
  }

  if (scheduledAt) {
    const when = new Date(scheduledAt);

    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ message: "Invalid 'scheduledAt'" });
    }

    if (when <= new Date()) {
      return res.status(400).json({
        message: "Scheduled time must be in the future",
      });
    }

    await scheduleCampaign(campaign.id, when);
    await campaign.update({
      status: CAMPAIGN_STATUS.SCHEDULED,
      scheduledAt: when,
    });

    logger.info("Campaign scheduled", { campaignId: campaign.id, when });

    return res.json({
      message: "Campaign scheduled",
      data: campaign,
    });
  }

  // Send now. Status stays SCHEDULED rather than jumping to PROCESSING — the
  // job owns that transition, and setting it here would trip the job's own
  // concurrency guard and make it return without sending anything.
  await campaign.update({
    status: CAMPAIGN_STATUS.SCHEDULED,
    scheduledAt: new Date(),
  });

  await sendCampaignNow(campaign.id);

  logger.info("Campaign dispatched immediately", { campaignId: campaign.id });

  return res.json({
    message: "Campaign is being sent",
    data: campaign,
  });
});

/**
 * CANCEL A SCHEDULED CAMPAIGN
 *
 * Back to draft. Deliberately impossible once sending has begun: the emails
 * already delivered cannot be recalled, and a half-sent campaign returned to
 * draft would look editable and resendable when it is neither.
 */
export const cancel = asyncWrapper(async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  if (campaign.status === CAMPAIGN_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Cannot cancel a campaign that is already sending",
    });
  }

  if (campaign.status === CAMPAIGN_STATUS.SENT) {
    return res.status(400).json({
      message: "Campaign has already been sent",
    });
  }

  await cancelCampaignSchedule(campaign.id);

  await campaign.update({
    status: CAMPAIGN_STATUS.DRAFT,
    scheduledAt: null,
  });

  // The audience is resolved fresh on the next run, so the rows from a
  // cancelled attempt would otherwise make the job think it had already
  // materialised and skip a rebuild — sending Friday's campaign to Monday's
  // audience.
  const removed = await CampaignRecipient.destroy({
    where: { campaignId: campaign.id },
  });

  logger.info("Campaign schedule cancelled", {
    campaignId: campaign.id,
    recipientRowsRemoved: removed,
  });

  return res.json({
    message: "Campaign cancelled and returned to draft",
    data: campaign,
  });
});

/**
 * SEND A TEST EMAIL
 *
 * Goes through `composeCampaignEmail`, the same function the job uses, so what
 * you test is byte-for-byte what ships — UTM rewriting and unsubscribe footer
 * included. A test path that composes its own HTML tests nothing.
 */
export const sendTest = asyncWrapper(async (req, res) => {
  const { to, name } = req.body;

  if (!to) {
    return res.status(400).json({ message: "'to' is required" });
  }

  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  if (!campaign.subject || !campaign.body || !campaign.senderEmail) {
    return res.status(400).json({
      message: "Set a sender, subject and body before sending a test",
    });
  }

  const { subject, html } = composeCampaignEmail(campaign, {
    email: to,
    name: name || "there",
  });

  const result = await sendMail({
    fromEmail: campaign.senderEmail,
    fromName: campaign.senderName || undefined,
    to,
    subject,
    html,
  });

  if (!result.success) {
    // sendMail never throws, so without this the panel would report a
    // successful test for an email that never left.
    return res.status(502).json({
      message: `Test email failed: ${result.error}`,
    });
  }

  return res.json({ message: `Test email sent to ${to}` });
});

/**
 * RETRY FAILED RECIPIENTS
 *
 * Flips `failed` rows back to `pending` and re-dispatches. An SES throttle or a
 * transient provider outage otherwise leaves a permanently unreachable slice of
 * the audience with no way to reach it short of a database write.
 *
 * Only failures. Suppressed rows are people who asked not to be mailed, and
 * retrying those would be the one bug this whole feature exists to prevent.
 */
export const retryFailed = asyncWrapper(async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  if (campaign.status === CAMPAIGN_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Campaign is still sending — wait for it to finish",
    });
  }

  const [count] = await CampaignRecipient.update(
    { status: CAMPAIGN_RECIPIENT_STATUS.PENDING, error: null },
    {
      where: {
        campaignId: campaign.id,
        status: CAMPAIGN_RECIPIENT_STATUS.FAILED,
      },
    },
  );

  if (!count) {
    return res.status(400).json({ message: "No failed recipients to retry" });
  }

  req.activity?.set({
    entityLabel: campaign.name,
    metadata: { affectedCount: count },
  });

  await sendCampaignNow(campaign.id);

  logger.info("Retrying failed campaign recipients", {
    campaignId: campaign.id,
    count,
  });

  return res.json({
    message: `Retrying ${count} failed recipient${count === 1 ? "" : "s"}`,
    data: { retrying: count },
  });
});
