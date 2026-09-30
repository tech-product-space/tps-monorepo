import db from "../../database/postgres/models/index.js";
import { CAMPAIGN_RECIPIENT_STATUS } from "../../config/constants/campaign.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const { Campaign, CampaignRecipient, Lead, Subscriber, sequelize } = db;

/**
 * CAMPAIGN STATS — tiers 0 and 3 of plan §9.
 *
 * Every number here is a `GROUP BY` over rows the send job already writes. No
 * new columns, no external dependency, nothing to switch on.
 *
 * Tiers 1 and 2 — bounces, complaints, opens, clicks — are deferred, so this
 * deliberately reports **delivery** and **outcome** and does not pretend to
 * report engagement. `providerMessageId` is captured per recipient so those can
 * be added later without backfilling anything.
 */
export const campaignStats = asyncWrapper(async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  const campaignId = campaign.id;

  const [statusRows, failureRows, windowRows, unsubscribed, leads, subscribers] =
    await Promise.all([
      CampaignRecipient.findAll({
        where: { campaignId },
        attributes: [
          "status",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        group: ["status"],
        raw: true,
      }),

      // Grouped, because 67 failures is a shrug and "63 × Email address is not
      // verified" is a fixable configuration problem.
      CampaignRecipient.findAll({
        where: { campaignId, status: CAMPAIGN_RECIPIENT_STATUS.FAILED },
        attributes: [
          "error",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        group: ["error"],
        order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      CampaignRecipient.findAll({
        where: { campaignId, status: CAMPAIGN_RECIPIENT_STATUS.SENT },
        attributes: [
          [sequelize.fn("MIN", sequelize.col("sentAt")), "firstSentAt"],
          [sequelize.fn("MAX", sequelize.col("sentAt")), "lastSentAt"],
        ],
        raw: true,
      }),

      // The only genuine engagement signal available before tier 2 — and the
      // one that says the audience was wrong rather than the subject line.
      Subscriber.count({ where: { unsubscribedFromCampaignId: campaignId } }),

      // Tier 3. Works because the public site already stamps utm_* onto every
      // record it creates, and the send job rewrites campaign links to carry
      // utm_campaign=<id>. No tracking infrastructure involved.
      Lead.count({ where: { utmCampaign: campaignId } }),
      Subscriber.count({ where: { utmCampaign: campaignId } }),
    ]);

  const byStatus = Object.fromEntries(
    statusRows.map((r) => [r.status, Number(r.count)]),
  );

  const counts = {
    pending: byStatus[CAMPAIGN_RECIPIENT_STATUS.PENDING] || 0,
    processing: byStatus[CAMPAIGN_RECIPIENT_STATUS.PROCESSING] || 0,
    sent: byStatus[CAMPAIGN_RECIPIENT_STATUS.SENT] || 0,
    failed: byStatus[CAMPAIGN_RECIPIENT_STATUS.FAILED] || 0,
    suppressed: byStatus[CAMPAIGN_RECIPIENT_STATUS.SUPPRESSED] || 0,
  };

  const resolved = Object.values(counts).reduce((a, b) => a + b, 0);
  const attempted = counts.sent + counts.failed;

  const rate = (n, of) => (of > 0 ? Number(((n / of) * 100).toFixed(2)) : 0);

  const { firstSentAt, lastSentAt } = windowRows[0] || {};

  return res.json({
    data: {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt,
        sentAt: campaign.sentAt,
      },

      audience: {
        resolved,
        queued: counts.pending + counts.processing,
        suppressed: counts.suppressed,
        ...counts,
      },

      delivery: {
        sent: counts.sent,
        failed: counts.failed,
        deliveryRate: rate(counts.sent, attempted),
        // Progress while a send is running, which is the whole value of this
        // screen mid-flight.
        progress: rate(attempted, resolved - counts.suppressed),
      },

      reaction: {
        unsubscribed,
        // Against delivered, not resolved — the people who could have reacted.
        unsubscribeRate: rate(unsubscribed, counts.sent),
      },

      outcome: {
        leads,
        subscribers,
        conversionRate: rate(leads, counts.sent),
      },

      failures: failureRows.map((r) => ({
        error: r.error || "Unknown error",
        count: Number(r.count),
      })),

      window: {
        firstSentAt: firstSentAt || null,
        lastSentAt: lastSentAt || null,
        durationMs:
          firstSentAt && lastSentAt
            ? new Date(lastSentAt).getTime() - new Date(firstSentAt).getTime()
            : null,
      },
    },
  });
});
