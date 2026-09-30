"use strict";

/**
 * Two partial indexes for the anonymous half of VisitorActivity.
 *
 * Recording visitors before they identify themselves multiplies this table by
 * roughly five — only about one visitor in five ever submits a form — and both
 * queries that touch those rows would otherwise scan the whole thing:
 *
 *   claim   "which rows does this browser own?" — runs on every form submission
 *   prune   "which unclaimed rows are old?"     — runs nightly
 *
 * Partial, because both only ever look at rows with no phone. That keeps them a
 * fraction of the size of full indexes and leaves the identified rows — the ones
 * read constantly by the CRM sync — indexed by the existing pair.
 *
 * The existing (visitorId, occurredAt) index could serve the claim, but it
 * covers every row for that browser including ones already claimed. This one
 * is narrower and matches the query's WHERE exactly.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `CREATE INDEX "visitor_activity_unclaimed_idx"
         ON "VisitorActivity" ("visitorId")
       WHERE phone IS NULL`,
    );

    await queryInterface.sequelize.query(
      `CREATE INDEX "visitor_activity_unclaimed_age_idx"
         ON "VisitorActivity" ("occurredAt")
       WHERE phone IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "visitor_activity_unclaimed_idx"`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "visitor_activity_unclaimed_age_idx"`,
    );
  },
};
