"use strict";

/**
 * Phase 2 of the unsubscribe consolidation.
 *
 * Adds an `email` column to `lead_consent` so opt-out checks can match a
 * person across different source rows (events vs platform_leads vs ...).
 * Backfills the column from the source tables. Also creates lead_consent
 * rows for every entry in `unsubscribes` so a click in a campaign email
 * (which writes to `unsubscribes`) now also lands in `lead_consent`.
 *
 * Existing cross-check reads in optOutGuard / filterUnsubscribedRecipients
 * still consult both tables, so this migration is purely additive — no
 * existing behavior breaks if the backfill misses rows.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tx = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn(
        "lead_consent",
        "email",
        { type: Sequelize.STRING, allowNull: true },
        { transaction: tx }
      );

      await queryInterface.addIndex("lead_consent", {
        name: "lead_consent_email_idx",
        fields: ["email"],
        transaction: tx,
      });

      // 1. Backfill the `email` column for existing lead_consent rows from
      //    each source table. UPDATE ... FROM is Postgres-specific.
      const backfillFromTable = async (sourceType, tableName, idColumn = "id") => {
        await queryInterface.sequelize.query(
          `UPDATE lead_consent lc
           SET email = LOWER(src.email)
           FROM "${tableName}" src
           WHERE lc.lead_source_type = :sourceType
             AND lc.lead_source_id = src."${idColumn}"::text
             AND src.email IS NOT NULL
             AND lc.email IS NULL`,
          { replacements: { sourceType }, transaction: tx }
        );
      };

      await backfillFromTable("platform_leads", "platform_leads");
      await backfillFromTable("external_leads", "external_leads");
      await backfillFromTable("resources", "ResourceLeads");
      await backfillFromTable("users", "users");

      // EventGuests has no email directly — email lives on the joined user row.
      await queryInterface.sequelize.query(
        `UPDATE lead_consent lc
         SET email = LOWER(usr.email)
         FROM "EventGuests" eg
         INNER JOIN users usr ON eg."userId" = usr.id
         WHERE lc.lead_source_type = 'events'
           AND lc.lead_source_id = eg.id::text
           AND usr.email IS NOT NULL
           AND lc.email IS NULL`,
        { transaction: tx }
      );

      // 2. For every email in `unsubscribes` (campaign-side opt-outs),
      //    create matching lead_consent rows so future workflow sends are
      //    blocked at the dispatcher even without the email-aware cross-check.
      //    Idempotent — uses ON CONFLICT DO NOTHING on the composite PK.
      const mirrorFromUnsubscribesForSource = async (
        sourceType,
        tableName,
        emailExpr,
        joinExpr = ""
      ) => {
        await queryInterface.sequelize.query(
          `INSERT INTO lead_consent
             (lead_source_type, lead_source_id, email,
              opt_out_email, opt_out_email_at, opt_out_email_reason,
              "createdAt", "updatedAt")
           SELECT
             :sourceType,
             src.id::text,
             LOWER(${emailExpr}),
             true,
             COALESCE(u."createdAt", NOW()),
             'backfilled_from_unsubscribes',
             NOW(),
             NOW()
           FROM "${tableName}" src
           ${joinExpr}
           INNER JOIN unsubscribes u ON LOWER(${emailExpr}) = LOWER(u.email)
           ON CONFLICT (lead_source_type, lead_source_id) DO UPDATE
             SET opt_out_email = TRUE,
                 opt_out_email_at = COALESCE(lead_consent.opt_out_email_at, EXCLUDED.opt_out_email_at),
                 opt_out_email_reason = COALESCE(lead_consent.opt_out_email_reason, EXCLUDED.opt_out_email_reason),
                 email = COALESCE(lead_consent.email, EXCLUDED.email),
                 "updatedAt" = NOW()
           WHERE lead_consent.opt_out_email IS DISTINCT FROM TRUE`,
          { replacements: { sourceType }, transaction: tx }
        );
      };

      await mirrorFromUnsubscribesForSource(
        "platform_leads",
        "platform_leads",
        "src.email"
      );
      await mirrorFromUnsubscribesForSource(
        "external_leads",
        "external_leads",
        "src.email"
      );
      await mirrorFromUnsubscribesForSource(
        "resources",
        "ResourceLeads",
        "src.email"
      );
      await mirrorFromUnsubscribesForSource(
        "users",
        "users",
        "src.email"
      );
      await mirrorFromUnsubscribesForSource(
        "events",
        "EventGuests",
        "usr.email",
        'INNER JOIN users usr ON src."userId" = usr.id'
      );

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    // Note: we don't undo the data backfill — those lead_consent rows are
    // real opt-outs and should stand even if the column is dropped.
    await queryInterface.removeIndex("lead_consent", "lead_consent_email_idx");
    await queryInterface.removeColumn("lead_consent", "email");
  },
};
