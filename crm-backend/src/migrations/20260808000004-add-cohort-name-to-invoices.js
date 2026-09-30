'use strict';

/**
 * Freeze the cohort an invoice was issued against.
 *
 * The invoice list and the invoice/receipt PDF both print the batch by reading
 * lead_courses.cohort_name live. That was harmless while a cohort never moved;
 * with deferrals it means a student changing batch silently rewrites what an
 * already-issued invoice says — including one the customer downloaded months
 * ago. A tax document must not move under people.
 *
 * Snapshotted at issue time, like every other buyer_* field on this table.
 * Backfilled from the enrollment, which is correct today because nothing has
 * been deferred yet.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'cohort_name', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE invoices i
      SET cohort_name = lc.cohort_name
      FROM lead_courses lc
      WHERE lc.id = i.lead_course_id
        AND lc.cohort_name IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'cohort_name');
  },
};
