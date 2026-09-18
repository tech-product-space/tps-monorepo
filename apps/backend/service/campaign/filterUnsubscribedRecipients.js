const { Op } = require("sequelize");
const { Unsubscribe, LeadConsent } = require("../../models");

/**
 * Drop recipients who have opted out of email — from EITHER opt-out table.
 *
 * Post-Phase-2 of the unsubscribe consolidation, `lead_consent.email` is
 * populated, so a single email-keyed query covers both source-row and
 * cross-source identity matching. The legacy `unsubscribes` table is still
 * checked as a fallback for any pre-migration data the backfill missed.
 */
async function filterUnsubscribedRecipients(recipients) {
  if (!recipients?.length) return [];

  const emails = [
    ...new Set(recipients.map((r) => r.email.trim().toLowerCase())),
  ];

  // 1. lead_consent — covers both old-style source-tuple opt-outs (via the
  //    backfilled email column) AND any workflow opt-outs since Phase 2.
  const consentRows = await LeadConsent.findAll({
    where: {
      opt_out_email: true,
      email: { [Op.in]: emails },
    },
    attributes: ["email"],
    raw: true,
  });
  const optedOut = new Set(
    consentRows.map((r) => r.email && r.email.toLowerCase()).filter(Boolean)
  );

  // 2. Legacy unsubscribes — catches rows whose source row was deleted or
  //    that pre-date the backfill.
  const unsubRows = await Unsubscribe.findAll({
    where: { email: { [Op.in]: emails } },
    attributes: ["email"],
    raw: true,
  });
  for (const u of unsubRows) optedOut.add(u.email.toLowerCase());

  return recipients.filter(
    (r) => !optedOut.has(r.email.trim().toLowerCase())
  );
}

module.exports = {
  filterUnsubscribedRecipients,
};
