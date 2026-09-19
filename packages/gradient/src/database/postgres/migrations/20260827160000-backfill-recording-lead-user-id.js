"use strict";

/**
 * Attach every pre-login-gate lead to the account that owns its address.
 *
 * The gate now requires an account and writes `userId` on every row, but the
 * rows written before that have none. Until this runs, the same person shows up
 * as an account on the recordings they watched recently and as a bare email on
 * the ones they watched earlier.
 *
 * That was survivable while `userId` was only used to *find* somebody's own
 * lead — the lookup falls back to email for exactly this reason. It stops being
 * survivable the moment the view split groups by person: an unclaimed row keys
 * on its email while a claimed one keys on the account, so one human is counted
 * as two and their second recording is reported as a first-time view.
 *
 * Matching on the address is sound here. `users.email` is unique, and a lead's
 * email is what the person typed into a form on this site — if it equals an
 * account's address, it is that account's owner. The gate's own lookup has
 * always treated the two as the same person; this only writes that down.
 *
 * The reverse is deliberately not attempted: a lead whose address matches no
 * account stays `userId: null` and is keyed by email, which is the honest
 * answer for somebody who never registered.
 */
export default {
  async up(queryInterface) {
    const [, meta] = await queryInterface.sequelize.query(`
      UPDATE "RecordingLeads" AS l
      SET "userId" = u.id
      FROM users AS u
      WHERE l."userId" IS NULL
        AND lower(u.email) = l.email
    `);

    console.log(`  backfilled userId on ${meta?.rowCount ?? 0} recording lead(s)`);
  },

  /**
   * Deliberately empty.
   *
   * Rolling back would have to null `userId` on the rows this touched, and
   * there is no record of which those were — the column is written by the gate
   * on every new lead too, so a blanket clear would destroy live data to undo a
   * backfill. The forward operation is idempotent; re-running it is safe.
   */
  async down() {},
};
