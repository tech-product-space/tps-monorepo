const cron = require("node-cron");
const { Op } = require("sequelize");
const { OnboardingOtp } = require("../../models");

/**
 * Sweep dead OTP challenges.
 *
 * The Mongo original in tps-next-backend used a TTL index on expiresAt and
 * needed no job. Postgres has no equivalent, so this is the replacement — the
 * one structural difference between the two implementations.
 *
 * A day's grace past expiry rather than deleting on the minute: it keeps the
 * "your code expired, request a new one" path answerable from the row instead
 * of collapsing into a generic failure, and the table is tiny either way.
 */
const GRACE_MS = 24 * 60 * 60 * 1000;

cron.schedule("17 * * * *", async () => {
  try {
    const removed = await OnboardingOtp.destroy({
      where: { expires_at: { [Op.lt]: new Date(Date.now() - GRACE_MS) } },
    });
    if (removed > 0) {
      console.log(`[onboarding-otp-cleanup] removed ${removed} expired challenge(s)`);
    }
  } catch (err) {
    console.error("[onboarding-otp-cleanup] failed:", err.message);
  }
});
