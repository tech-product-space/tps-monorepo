"use strict";

/**
 * One *live* certificate per person per event — revoked ones do not count.
 *
 * The original constraint was unconditional, which made a correction on an
 * already-issued certificate impossible whenever the email stayed the same:
 * `correctRecipient` revokes the original and inserts a replacement, and the
 * replacement collided with the row it had just revoked. Correcting a
 * misspelled *name* — the commonest correction there is — therefore 500'd.
 *
 * A partial unique index says what was always meant. Two revoked rows for the
 * same address are fine; two live ones are not, which is the property every
 * create path leans on:
 *
 *   - `bulkCreate({ ignoreDuplicates: true })` emits `ON CONFLICT DO NOTHING`
 *     with no conflict target, so it still resolves against a partial index
 *   - two admins pressing Generate at once still cannot mint two certificates
 *   - a submission arriving while an admin holds a Pending row still collides
 */
export default {
  async up(queryInterface) {
    await queryInterface.removeConstraint(
      "EventCertificates",
      "event_certificates_event_id_recipient_email_unique",
    );

    // Raw SQL: `addIndex`'s `where` option does not emit a partial index for a
    // unique index on every dialect, and this needs to be exact.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "event_certificates_live_recipient_unique"
        ON "EventCertificates" ("eventId", "recipientEmail")
        WHERE "status" <> 'Revoked';
    `);
  },

  /**
   * Note: rolling back can fail, legitimately.
   *
   * Once a correction has produced a revoked original alongside a live
   * replacement for the same address, those two rows cannot both exist under
   * the unconditional constraint. Rolling back then needs those pairs resolved
   * by hand first — which is itself the argument for the partial index.
   */
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "event_certificates_live_recipient_unique";
    `);

    await queryInterface.addConstraint("EventCertificates", {
      fields: ["eventId", "recipientEmail"],
      type: "unique",
      name: "event_certificates_event_id_recipient_email_unique",
    });
  },
};
