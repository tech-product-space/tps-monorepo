'use strict';

/**
 * Cohort snapshot + purpose on payments.
 *
 * COHORT SNAPSHOT — this is the column that makes cohort revenue trustworthy.
 * Without it, cohort revenue has to be read through lead_courses.cohort_id, so
 * deferring one student retroactively moves every rupee they ever paid into
 * their new batch and a closed month's numbers change after the fact. With it:
 *
 *   collected → payments.cohort_id      frozen once the payment is paid
 *   upcoming  → lead_courses.cohort_id  follows the student
 *
 * On a deferral, only payments still 'pending' are re-stamped to the new cohort
 * (unrecognised money follows the student); paid/cancelled rows never move.
 *
 * PURPOSE — which ledger the money belongs to. A deferral fee has nothing to do
 * with the course fee the student enrolled at, so it is tracked separately
 * rather than folded into final_fee. Three readers need to tell them apart and
 * none of them can rely on free text:
 *
 *   1. validatePaymentTarget caps a payment within its own ledger
 *   2. per-agent revenue excludes deferral fees (a rescheduling fee is not a
 *      sale — same treatment as re-enrollments)
 *   3. the first-paid-payment trigger ignores them, so an admin fee cannot
 *      register a conversion or fire the course onboarding email
 *
 * `description` could not do this job: it is customer-facing (passed to
 * Razorpay/Cashfree as the payment-link description) and typed by hand.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'cohort_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'cohorts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('payments', 'cohort_name', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });

    await queryInterface.addColumn('payments', 'purpose', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'course_fee',
    });

    // Backfill the cohort from the enrollment. Accurate by construction:
    // nothing has been deferred yet, so an enrollment's current cohort is the
    // one every one of its payments was received under.
    //
    // Standalone payments (lead_course_id IS NULL) keep a NULL cohort — they
    // are not attached to a batch and never were.
    await queryInterface.sequelize.query(`
      UPDATE payments p
      SET cohort_id   = lc.cohort_id,
          cohort_name = lc.cohort_name
      FROM lead_courses lc
      WHERE lc.id = p.lead_course_id
        AND lc.cohort_id IS NOT NULL
    `);

    // purpose needs no backfill — every existing payment is a course fee and
    // the column default already says so.

    await queryInterface.addIndex('payments', ['cohort_id', 'status', 'paid_at'], {
      name: 'payments_cohort_status_paid_idx',
    });

    await queryInterface.addIndex('payments', ['lead_course_id', 'purpose'], {
      name: 'payments_course_purpose_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'payments_course_purpose_idx');
    await queryInterface.removeIndex('payments', 'payments_cohort_status_paid_idx');
    await queryInterface.removeColumn('payments', 'purpose');
    await queryInterface.removeColumn('payments', 'cohort_name');
    await queryInterface.removeColumn('payments', 'cohort_id');
  },
};
