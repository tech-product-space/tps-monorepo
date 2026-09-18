"use strict";

/**
 * The two columns the watch flow needs on `RecordingLeads`.
 *
 * See §15 of RECORDINGS_PLAN.md. Both exist so a person fills the gate's form
 * once and later recordings carry their answers forward instead of asking
 * again.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("RecordingLeads", "detailsConfirmedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("RecordingLeads", "source", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "form",
    });

    /**
     * Backfill, and it is not optional.
     *
     * `isRecordingProfileStale` treats a null `detailsConfirmedAt` as stale, so
     * without this every lead already collected would be asked to confirm their
     * details on their next visit — the exact friction the carry exists to
     * remove. `lastSubmittedAt` is the closest thing those rows have to "when
     * they last told us this", and it is never null.
     *
     * `source` needs no statement: every existing row came from somebody
     * filling the form, which is the column's default.
     */
    await queryInterface.sequelize.query(`
      UPDATE "RecordingLeads"
      SET "detailsConfirmedAt" = "lastSubmittedAt"
      WHERE "detailsConfirmedAt" IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("RecordingLeads", "source");
    await queryInterface.removeColumn("RecordingLeads", "detailsConfirmedAt");
  },
};
