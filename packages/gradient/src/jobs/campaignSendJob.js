import agenda from "../config/agenda.js";

import db from "../database/postgres/models/index.js";
import {
  CAMPAIGN_RECIPIENT_STATUS,
  CAMPAIGN_STATUS,
} from "../config/constants/campaign.js";
import {
  BODIES,
  buildEmail,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../services/email/index.js";
import { buildRecipients } from "../services/campaign/buildRecipients.js";
import { appendCampaignUtm } from "../services/campaign/appendCampaignUtm.js";
import {
  findSuppressed,
  isSuppressed,
} from "../services/subscriber/suppression.service.js";
import { buildUnsubscribeUrl } from "../services/subscriber/unsubscribeToken.js";
import capitalizeName from "../util/helpers/capitalizeName.js";
import logger from "../util/logger.js";

const { Campaign, CampaignRecipient, sequelize } = db;

const JOB_NAME = "send-campaign";
const MAX_RETRIES = 1;
const RETRY_DELAY = "in 2 minutes";

/** Rows claimed per pass. Small enough that a crash strands few, large enough
 *  that the claim transaction is not the bottleneck. */
const BATCH_SIZE = 50;

/**
 * Pause between sends, in milliseconds.
 *
 * SES enforces a per-second send rate and answers a burst with a throttling
 * error, which this job would record as a per-recipient failure — a real
 * recipient marked failed because we sent too fast, not because anything was
 * wrong with their address. ~10/second is conservative for any production SES
 * quota. Raise it only against a known quota.
 */
const SEND_INTERVAL_MS = 100;

/**
 * Agenda's default lock is 10 minutes; a campaign of any size outlives that and
 * gets picked up again mid-send. Doubles as the window after which a campaign
 * stuck on PROCESSING is treated as abandoned — the process died and nothing
 * will ever finish it. Same value and reasoning as the reminder job.
 */
const LOCK_LIFETIME = 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Everything a campaign needs before it may be sent.
 *
 * Checked here as well as in the panel: a campaign can be scheduled and then
 * have its sender removed, and the job is the last point at which that can be
 * caught before several thousand people are mailed from nowhere.
 */
const missingFields = (campaign) => {
  const missing = [];

  if (!campaign.senderEmail) missing.push("sender");
  if (!campaign.subject) missing.push("subject");
  if (!campaign.body) missing.push("body");

  const filters = campaign.recipientFilters;
  const include = filters?.include ?? filters?.sources ?? [];

  if (!Array.isArray(include) || include.length === 0) {
    missing.push("audience");
  }

  return missing;
};

/**
 * Materialises the audience into `campaign_recipients`, once.
 *
 * Suppressed people are stored as rows rather than dropped: "we resolved 12,000
 * and mailed 11,400" then has a visible explanation instead of an unaccounted
 * gap.
 */
const materialiseRecipients = async (campaign) => {
  const existing = await CampaignRecipient.count({
    where: { campaignId: campaign.id },
  });

  if (existing) {
    logger.info("Campaign recipients already materialised", {
      campaignId: campaign.id,
      existing,
    });
    return existing;
  }

  const { recipients, stats } = await buildRecipients(campaign.recipientFilters);

  if (!recipients.length) {
    throw new Error("No recipients found for campaign");
  }

  const suppressed = await findSuppressed(recipients.map((r) => r.email));

  await CampaignRecipient.bulkCreate(
    recipients.map((r) => ({
      campaignId: campaign.id,
      email: r.email,
      name: r.name,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      status: suppressed.has(r.email)
        ? CAMPAIGN_RECIPIENT_STATUS.SUPPRESSED
        : CAMPAIGN_RECIPIENT_STATUS.PENDING,
    })),
  );

  await campaign.update({ totalRecipients: recipients.length });

  logger.info("Campaign recipients materialised", {
    campaignId: campaign.id,
    resolved: recipients.length,
    suppressed: suppressed.size,
    excluded: stats.excluded,
  });

  return recipients.length;
};

/**
 * Claims a batch under a row lock.
 *
 * The transaction plus `LOCK.UPDATE` is what stops two workers — or the same
 * job resumed after its Agenda lock expired — from mailing the same people
 * twice. Rows move to PROCESSING inside the same transaction that selected
 * them, so nothing else can see them as pending.
 */
const claimBatch = async (campaignId) =>
  sequelize.transaction(async (t) => {
    const rows = await CampaignRecipient.findAll({
      where: {
        campaignId,
        status: CAMPAIGN_RECIPIENT_STATUS.PENDING,
      },
      limit: BATCH_SIZE,
      lock: t.LOCK.UPDATE,
      skipLocked: true,
      transaction: t,
    });

    if (!rows.length) return [];

    await CampaignRecipient.update(
      { status: CAMPAIGN_RECIPIENT_STATUS.PROCESSING },
      { where: { id: rows.map((r) => r.id) }, transaction: t },
    );

    return rows;
  });

/**
 * Composes and sends one campaign email.
 *
 * Exported because the send-test endpoint uses the identical path — what you
 * test is byte-for-byte what ships, including the UTM rewrite and the
 * unsubscribe footer.
 */
export const composeCampaignEmail = (campaign, recipient) => {
  const name = capitalizeName(recipient.name || "there");

  const unsubscribeUrl = buildUnsubscribeUrl(recipient.email, campaign.id);

  // UTM first, then the footer: the unsubscribe link is added afterwards and
  // must not be rewritten, and the rewriter skips it in any case.
  const trackedBody = appendCampaignUtm(campaign.body, campaign.id);

  return {
    subject: BODIES.CUSTOM(campaign.subject, { name }),
    html: buildEmail({
      header: HEADERS.GRADIENT,
      body: BODIES.CUSTOM(trackedBody, { name }),
      // Mandatory, on every campaign email, with no per-sender exemption.
      footer: FOOTERS.GRADIENT_MARKETING,
      footerProps: { unsubscribeUrl },
    }),
  };
};

/* ────────────────────────────────────────────────────────────────────────── */

export default function campaignSendJob() {
  agenda.define(
    JOB_NAME,
    async (job) => {
      const { campaignId } = job.attrs.data;

      logger.info("Campaign job started", { campaignId });

      try {
        const campaign = await Campaign.findByPk(campaignId);

        if (!campaign) {
          logger.warn("Campaign not found, skipping", { campaignId });
          return;
        }

        if (campaign.status === CAMPAIGN_STATUS.SENT) {
          logger.info("Campaign already sent", { campaignId });
          return;
        }

        /* ── Guard against a concurrent run ───────────────────────────────
           Same shape as the reminder job: a fresh PROCESSING means another
           worker holds it; a stale one means the process died mid-send and
           this run should reclaim it. */
        if (campaign.status === CAMPAIGN_STATUS.PROCESSING) {
          const startedAt = campaign.updatedAt?.getTime() ?? 0;

          if (Date.now() - startedAt < LOCK_LIFETIME) {
            logger.info("Campaign already running", { campaignId });
            return;
          }

          logger.warn("Reclaiming stale processing campaign", {
            campaignId,
            startedAt: campaign.updatedAt,
          });
        }

        const missing = missingFields(campaign);

        if (missing.length) {
          throw new Error(`Campaign is missing: ${missing.join(", ")}`);
        }

        await materialiseRecipients(campaign);

        await campaign.update({ status: CAMPAIGN_STATUS.PROCESSING });

        /* ── Send ─────────────────────────────────────────────────────── */
        let totalSent = 0;
        let totalFailed = 0;
        let batchNumber = 0;

        while (true) {
          const batch = await claimBatch(campaignId);

          if (!batch.length) break;

          batchNumber++;

          for (const recipient of batch) {
            try {
              // The second suppression check, and the reason it exists: a long
              // send outlives the moment the audience was built, and someone
              // who unsubscribes at minute five must not still be mailed at
              // minute forty by the campaign that prompted them.
              if (await isSuppressed(recipient.email)) {
                await recipient.update({
                  status: CAMPAIGN_RECIPIENT_STATUS.SUPPRESSED,
                });
                continue;
              }

              const { subject, html } = composeCampaignEmail(
                campaign,
                recipient,
              );

              const result = await sendMail({
                fromEmail: campaign.senderEmail,
                fromName: campaign.senderName || undefined,
                to: recipient.email,
                subject,
                html,
              });

              // sendMail resolves rather than throws. Treating a rejection as
              // the only failure mode would mark every failed send as sent.
              if (!result.success) {
                throw new Error(result.error || "Send failed");
              }

              await recipient.update({
                status: CAMPAIGN_RECIPIENT_STATUS.SENT,
                sentAt: new Date(),
                providerMessageId: result.messageId ?? null,
                error: null,
              });

              totalSent++;
            } catch (error) {
              await recipient.update({
                status: CAMPAIGN_RECIPIENT_STATUS.FAILED,
                error: error.message?.slice(0, 1000) ?? "Unknown error",
              });

              totalFailed++;

              logger.error("Campaign email failed", {
                campaignId,
                email: recipient.email,
                error: error.message,
              });
            }

            if (SEND_INTERVAL_MS) await sleep(SEND_INTERVAL_MS);
          }

          logger.info("Campaign batch complete", {
            campaignId,
            batch: batchNumber,
            totalSent,
            totalFailed,
          });
        }

        /* ── Record the outcome ───────────────────────────────────────────
           Counted from the table rather than the loop, so a resumed run
           reports the campaign's totals and not just this pass's. */
        const [sent, failed] = await Promise.all([
          CampaignRecipient.count({
            where: { campaignId, status: CAMPAIGN_RECIPIENT_STATUS.SENT },
          }),
          CampaignRecipient.count({
            where: { campaignId, status: CAMPAIGN_RECIPIENT_STATUS.FAILED },
          }),
        ]);

        // A run where nothing left the building is a failure, however tidily it
        // completed — the same reasoning as the reminder job. An audience that
        // was entirely suppressed is the one exception: nothing was meant to
        // send, and that is a correct outcome rather than a broken one.
        const suppressedOnly = sent === 0 && failed === 0;

        await campaign.update({
          status:
            sent > 0 || suppressedOnly
              ? CAMPAIGN_STATUS.SENT
              : CAMPAIGN_STATUS.FAILED,
          sentAt: new Date(),
          totalSent: sent,
          totalFailed: failed,
        });

        logger.info("Campaign job completed", { campaignId, sent, failed });
      } catch (error) {
        logger.error("Campaign job failed", {
          campaignId,
          error: error.message,
        });

        const attempts = job.attrs.failCount || 0;
        const willRetry = attempts < MAX_RETRIES;

        // Release the PROCESSING lock either way. Left set, the retry and every
        // later run return early at the guard above and the campaign sits on
        // `processing` for good.
        try {
          await Campaign.update(
            {
              status: willRetry
                ? CAMPAIGN_STATUS.SCHEDULED
                : CAMPAIGN_STATUS.FAILED,
            },
            { where: { id: campaignId } },
          );
        } catch (statusError) {
          logger.error("Failed to reset campaign status", {
            campaignId,
            error: statusError.message,
          });
        }

        if (willRetry) {
          logger.warn("Retrying campaign job", {
            campaignId,
            attempt: attempts + 1,
          });

          job.schedule(RETRY_DELAY);
          await job.save();
        }

        throw error;
      }
    },
    { lockLifetime: LOCK_LIFETIME },
  );
}

/* ── Scheduler controls ─────────────────────────────────────────────────── */

/**
 * `data: { campaignId }` and NOT `"data.campaignId"`.
 *
 * The dot-notation form is a MongoDB idiom; the Postgres backend's filter
 * builder understands only id/ids/name/names/notNames/data and silently drops
 * anything else — which would cancel *every* campaign job rather than this one.
 * The reminder job learned this the hard way; do not "tidy" it.
 */
export const cancelCampaignSchedule = async (campaignId) =>
  agenda.cancel({ name: JOB_NAME, data: { campaignId } });

export const scheduleCampaign = async (campaignId, scheduledAt) => {
  await cancelCampaignSchedule(campaignId);

  return agenda.schedule(new Date(scheduledAt), JOB_NAME, { campaignId });
};

export const sendCampaignNow = async (campaignId) => {
  await cancelCampaignSchedule(campaignId);

  return agenda.now(JOB_NAME, { campaignId });
};
