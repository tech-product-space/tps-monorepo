const { Op } = require("sequelize");
const {
  verifyUnsubscribeToken,
} = require("../../service/campaign/emailUnsubscribeToken");
const { LeadConsent, Unsubscribe, NewsletterEmail } = require("../../models");

/**
 * Campaign-side unsubscribe endpoint. After the Phase-3 consolidation,
 * opt-outs are stored exclusively in `lead_consent` (the surrogate-PK,
 * email-keyed source of truth). The legacy `unsubscribes` table is left
 * in place for a deprecation window — a separate migration drops it.
 *
 * Idempotent. Marks every existing `lead_consent` row sharing this email
 * as opted-out, and inserts a single email-only row when none exist.
 */
const unsubscribeUser = async (req, res) => {
  try {
    const { token, reason } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token is required",
      });
    }

    const data = verifyUnsubscribeToken(token);
    if (!data) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired unsubscribe link",
      });
    }

    const email = (data.email || "").trim().toLowerCase();
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Token missing email" });
    }

    const now = new Date();
    const optOutReason = reason || "user_unsubscribed_via_campaign";

    // Flip every matching consent row to opted-out. Covers all source
    // rows associated with this email (events + platform_leads + ...).
    const [updatedCount] = await LeadConsent.update(
      {
        opt_out_email: true,
        opt_out_email_at: now,
        opt_out_email_reason: optOutReason,
      },
      {
        where: {
          email,
          [Op.or]: [{ opt_out_email: false }, { opt_out_email: null }],
        },
      }
    );

    const alreadyOptedOut = await LeadConsent.count({
      where: { email, opt_out_email: true },
    });

    // If nothing matched (no source row known for this email), seed an
    // email-only row so future sends still see the opt-out.
    if (updatedCount === 0 && alreadyOptedOut === 0) {
      await LeadConsent.create({
        email,
        opt_out_email: true,
        opt_out_email_at: now,
        opt_out_email_reason: optOutReason,
      });
    }

    // Keep dual-writing to the legacy `unsubscribes` table for now. Lets
    // any code still reading from it (admin tools, reports, the legacy
    // filter path) keep working. Best-effort — a failure here must not
    // block the canonical lead_consent write that already happened above.
    try {
      await Unsubscribe.findOrCreate({
        where: { email },
        defaults: {
          email,
          campaignId: data.campaignId || null,
          reason: optOutReason,
        },
      });
    } catch (legacyErr) {
      console.error(
        "unsubscribeUser: legacy Unsubscribe mirror failed:",
        legacyErr.message
      );
    }

    // Keep the newsletter list in sync so the admin newsletter table reflects
    // the opt-out (best-effort; matches email case-insensitively).
    try {
      await NewsletterEmail.update(
        { status: "unsubscribed" },
        { where: { email: { [Op.iLike]: email } } }
      );
    } catch (newsletterErr) {
      console.warn(
        "unsubscribeUser: newsletter sync failed:",
        newsletterErr.message
      );
    }

    const wasAlreadyOptedOut = updatedCount === 0 && alreadyOptedOut > 0;

    return res.status(200).json({
      success: true,
      message: wasAlreadyOptedOut
        ? "You are already unsubscribed"
        : "You have been unsubscribed successfully",
    });
  } catch (error) {
    console.error("Unsubscribe Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

/**
 * Admin endpoint — list everyone currently opted out of email.
 * Reads from the new source of truth (`lead_consent`).
 *
 * Response shape is aliased to match what the admin UI expects:
 *   { id, email, reason, createdAt, lead_source_type, lead_source_id }
 * `reason` ← opt_out_email_reason
 * `createdAt` ← opt_out_email_at (when they opted out) — falls back to the
 *   row's row-creation timestamp for old rows where the opt-out timestamp
 *   is null.
 */
const getUnsubscribedUsers = async (req, res) => {
  try {
    const rows = await LeadConsent.findAll({
      where: { opt_out_email: true },
      attributes: [
        "id",
        "email",
        "lead_source_type",
        "lead_source_id",
        "opt_out_email_at",
        "opt_out_email_reason",
        "createdAt",
      ],
      order: [["opt_out_email_at", "DESC"]],
      raw: true,
    });

    const data = rows.map((r) => ({
      id: r.id,
      email: r.email,
      reason: r.opt_out_email_reason,
      createdAt: r.opt_out_email_at || r.createdAt,
      lead_source_type: r.lead_source_type,
      lead_source_id: r.lead_source_id,
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching unsubscribed users:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

module.exports = {
  unsubscribeUser,
  getUnsubscribedUsers,
};
