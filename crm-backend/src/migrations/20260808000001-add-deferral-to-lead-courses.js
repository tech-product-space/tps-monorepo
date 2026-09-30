'use strict';

/**
 * Cohort deferral — state on the enrollment.
 *
 * Moving a student to a later batch stops being a silent field edit and becomes
 * a recorded deferral. See COHORT_DEFERRAL_PLAN.md.
 *
 * `is_deferred` is a FLAG, deliberately not a third value of `status`. A
 * deferred student is still enrolled and still owes money, so they must keep
 * matching every `status = 'active'` filter in the codebase — the partial unique
 * index, validatePaymentTarget, the pipeline query, deleteCohort's usage count.
 * This mirrors is_reenrollment, which exists for exactly the same reason.
 *
 * `original_cohort_*` is backfilled from the current cohort: nothing has been
 * deferred yet, so where everyone is now IS where they started. After this
 * migration `cohort_id` means "where they are now" and `original_cohort_id`
 * means "the batch they were sold into" — the two halves of cohort revenue
 * attribution (plan §6).
 *
 * `deferral_fee_total` is a SECOND LEDGER and is never added into `final_fee`:
 * the fee has nothing to do with the price the student enrolled at, and
 * `final_fee` is what an issued invoice's tax breakdown reconciles to.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lead_courses', 'is_deferred', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Effective date of the LATEST move. Back-datable within
    // [enrolled_at, now], same bounds as dropped_at.
    await queryInterface.addColumn('lead_courses', 'deferred_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // How many times this enrollment has moved batch. Also the flag that says
    // whether original_cohort_* has been claimed yet — it is set on the first
    // deferral only, and never moves again.
    await queryInterface.addColumn('lead_courses', 'deferral_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('lead_courses', 'original_cohort_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'cohorts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Snapshot, so the original batch stays readable after the cohort row is
    // renamed or deleted — same reasoning as lead_courses.cohort_name.
    await queryInterface.addColumn('lead_courses', 'original_cohort_name', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });

    await queryInterface.addColumn('lead_courses', 'deferral_fee_total', {
      type: Sequelize.DECIMAL(14, 3),
      allowNull: false,
      defaultValue: 0,
    });

    // Backfill: today's cohort is the original one for every existing row.
    await queryInterface.sequelize.query(`
      UPDATE lead_courses
      SET original_cohort_id   = cohort_id,
          original_cohort_name = cohort_name
      WHERE cohort_id IS NOT NULL
    `);

    // Cohort revenue reads both directions: "who is running in this batch"
    // (cohort_id, filtered to active) and "who was sold into it".
    await queryInterface.addIndex('lead_courses', ['cohort_id', 'status'], {
      name: 'lead_courses_cohort_status_idx',
    });

    await queryInterface.addIndex('lead_courses', ['original_cohort_id'], {
      name: 'lead_courses_original_cohort_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('lead_courses', 'lead_courses_original_cohort_idx');
    await queryInterface.removeIndex('lead_courses', 'lead_courses_cohort_status_idx');
    await queryInterface.removeColumn('lead_courses', 'deferral_fee_total');
    await queryInterface.removeColumn('lead_courses', 'original_cohort_name');
    await queryInterface.removeColumn('lead_courses', 'original_cohort_id');
    await queryInterface.removeColumn('lead_courses', 'deferral_count');
    await queryInterface.removeColumn('lead_courses', 'deferred_at');
    await queryInterface.removeColumn('lead_courses', 'is_deferred');
  },
};
