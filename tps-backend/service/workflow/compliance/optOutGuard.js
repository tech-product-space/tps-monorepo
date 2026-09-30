"use strict";

const { Op } = require("sequelize");
const { LeadConsent, Unsubscribe } = require("../../../models");

/**
 * Returns true if the lead is opted-out of email.
 *
 * Post-Phase-2, `lead_consent` is the source of truth — it has an `email`
 * column populated from source-table backfill + from new writes. A single
 * indexed query covers BOTH "same source row" and "same email via any
 * source row." The legacy `unsubscribes` table is still checked as a
 * fallback for any pre-migration data the backfill couldn't cover (e.g.
 * an unsubscribed email whose source row has since been deleted).
 *
 * Pass `email` whenever available (workflow dispatcher always has it).
 * When omitted, only the source-tuple match runs.
 *
 * Defaults to false (allowed) if no consent record exists.
 */
async function isEmailOptedOut(sourceType, sourceId, email = null) {
  const normalizedEmail =
    email && typeof email === "string" ? email.trim().toLowerCase() : null;

  // Single LeadConsent lookup: match by source-tuple OR by email.
  const orConditions = [
    {
      lead_source_type: sourceType,
      lead_source_id: String(sourceId),
    },
  ];
  if (normalizedEmail) orConditions.push({ email: normalizedEmail });

  const leadConsentRow = await LeadConsent.findOne({
    where: {
      opt_out_email: true,
      [Op.or]: orConditions,
    },
    attributes: ["lead_source_type"],
  });
  if (leadConsentRow) return true;

  // Legacy fallback: unsubscribes table. Should be rare after the backfill
  // migration; kept so a pre-migration row whose source row was later
  // deleted still blocks sends.
  if (normalizedEmail) {
    const unsubRow = await Unsubscribe.findOne({
      where: { email: normalizedEmail },
      attributes: ["id"],
    });
    if (unsubRow) return true;
  }

  return false;
}

async function isWhatsappOptedOut(sourceType, sourceId) {
  const row = await LeadConsent.findOne({
    where: { lead_source_type: sourceType, lead_source_id: sourceId },
    attributes: ["opt_out_whatsapp"],
  });
  return !!(row && row.opt_out_whatsapp);
}

/**
 * Set a lead's opt-out flag. Idempotent — upserts the lead_consent row.
 */
async function recordOptOut({
  sourceType,
  sourceId,
  channel,
  reason = "user_unsubscribed",
}) {
  const now = new Date();
  const [row] = await LeadConsent.findOrCreate({
    where: { lead_source_type: sourceType, lead_source_id: sourceId },
    defaults: { lead_source_type: sourceType, lead_source_id: sourceId },
  });

  const patch = {};
  if (channel === "email") {
    patch.opt_out_email = true;
    patch.opt_out_email_at = now;
    patch.opt_out_email_reason = reason;
  } else if (channel === "whatsapp") {
    patch.opt_out_whatsapp = true;
    patch.opt_out_whatsapp_at = now;
    patch.opt_out_whatsapp_reason = reason;
  } else {
    throw new Error(`unknown opt-out channel: ${channel}`);
  }
  await row.update(patch);
  return row;
}

module.exports = {
  isEmailOptedOut,
  isWhatsappOptedOut,
  recordOptOut,
};
