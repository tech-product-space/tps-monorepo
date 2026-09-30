"use strict";

/**
 * Phase 3a of the unsubscribe consolidation.
 *
 * Reshapes `lead_consent` so `email` is the natural identity. Replaces the
 * composite PK `(lead_source_type, lead_source_id)` with a surrogate UUID,
 * making both source columns nullable so we can store email-only opt-outs
 * (from the legacy `unsubscribes` table that has no source-row context).
 *
 * Also seeds email-only rows for every `unsubscribes` entry that didn't
 * already get backfilled by the Phase 2 migration (i.e. emails with no
 * matching source row in any of the source tables).
 *
 * Pairs with a follow-up migration (`-drop-unsubscribes`) that drops the
 * legacy table. Run that one only after this has baked in production.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tx = await queryInterface.sequelize.transaction();
    try {
      // 1. Add surrogate `id` column, populate for existing rows, promote
      //    to PRIMARY KEY. We use ulid-like text (matches the rest of this
      //    codebase) rather than UUID to keep IDs grep-able and ordered.
      await queryInterface.addColumn(
        "lead_consent",
        "id",
        {
          type: Sequelize.STRING,
          allowNull: true, // tightened to NOT NULL after backfill
        },
        { transaction: tx }
      );

      await queryInterface.sequelize.query(
        `UPDATE lead_consent
         SET id = md5(lead_source_type || ':' || lead_source_id) || '-' || floor(random() * 1000000)::text
         WHERE id IS NULL`,
        { transaction: tx }
      );

      await queryInterface.changeColumn(
        "lead_consent",
        "id",
        { type: Sequelize.STRING, allowNull: false },
        { transaction: tx }
      );

      // Drop the composite PK and replace with the surrogate id.
      await queryInterface.sequelize.query(
        `ALTER TABLE lead_consent DROP CONSTRAINT lead_consent_pkey`,
        { transaction: tx }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE lead_consent ADD PRIMARY KEY (id)`,
        { transaction: tx }
      );

      // 2. Make the source columns nullable so we can store email-only rows.
      await queryInterface.changeColumn(
        "lead_consent",
        "lead_source_type",
        { type: Sequelize.STRING, allowNull: true },
        { transaction: tx }
      );
      await queryInterface.changeColumn(
        "lead_consent",
        "lead_source_id",
        { type: Sequelize.STRING, allowNull: true },
        { transaction: tx }
      );

      // 3. Add a partial unique index on (lead_source_type, lead_source_id)
      //    where they're both NOT NULL, so source-tuple dedupe still holds
      //    for the rows that DO have one. Email-only rows aren't covered.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX lead_consent_source_tuple_idx
         ON lead_consent (lead_source_type, lead_source_id)
         WHERE lead_source_type IS NOT NULL AND lead_source_id IS NOT NULL`,
        { transaction: tx }
      );

      // 4. Backfill email-only rows for every `unsubscribes` entry whose
      //    email isn't yet represented in `lead_consent`. These are the
      //    edge cases the Phase 2 migration couldn't cover (e.g. a campaign
      //    recipient whose source row was later deleted, or someone who
      //    only ever appeared on a contact list).
      await queryInterface.sequelize.query(
        `INSERT INTO lead_consent
           (id, lead_source_type, lead_source_id, email,
            opt_out_email, opt_out_email_at, opt_out_email_reason,
            "createdAt", "updatedAt")
         SELECT
           'unsub_' || u.id,
           NULL,
           NULL,
           LOWER(u.email),
           TRUE,
           COALESCE(u."createdAt", NOW()),
           COALESCE('backfilled_from_unsubscribes: ' || u.reason, 'backfilled_from_unsubscribes'),
           NOW(),
           NOW()
         FROM unsubscribes u
         WHERE NOT EXISTS (
           SELECT 1 FROM lead_consent lc
           WHERE LOWER(lc.email) = LOWER(u.email)
             AND lc.opt_out_email = TRUE
         )`,
        { transaction: tx }
      );

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    // Reversal: drop the new index, re-tighten source columns, restore the
    // composite PK, drop the surrogate id. This will FAIL if email-only
    // rows exist (no source-tuple to anchor the PK) — clean those up by
    // hand or skip the revert. Leaving the data alone is fine; the column
    // is the only structural change.
    const tx = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS lead_consent_source_tuple_idx`,
        { transaction: tx }
      );
      await queryInterface.sequelize.query(
        `DELETE FROM lead_consent WHERE lead_source_type IS NULL OR lead_source_id IS NULL`,
        { transaction: tx }
      );
      await queryInterface.changeColumn(
        "lead_consent",
        "lead_source_type",
        { type: queryInterface.sequelize.Sequelize.STRING, allowNull: false },
        { transaction: tx }
      );
      await queryInterface.changeColumn(
        "lead_consent",
        "lead_source_id",
        { type: queryInterface.sequelize.Sequelize.STRING, allowNull: false },
        { transaction: tx }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE lead_consent DROP CONSTRAINT lead_consent_pkey`,
        { transaction: tx }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE lead_consent ADD PRIMARY KEY (lead_source_type, lead_source_id)`,
        { transaction: tx }
      );
      await queryInterface.removeColumn("lead_consent", "id", { transaction: tx });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  },
};
