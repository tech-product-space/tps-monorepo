'use strict';

/**
 * Enrollment drop-out and re-enrollment.
 *
 * Until now an enrollment could be created but never ended, so a student who
 * left still counted as current and their unpaid balance showed as owed
 * forever — and because enrollCourse refuses a second row for the same
 * (profile, course), they could never come back either.
 *
 * Every column defaults so that existing rows become status='active' with
 * is_reenrollment=false. That is exactly what they already are, so no backfill
 * is needed and every query that does not yet filter on these keeps returning
 * precisely what it returns today.
 *
 * Two indexes:
 *   - status: read by the enrollments list and ~8 dashboard queries
 *   - lead_courses_one_active_per_course: PARTIAL unique index enforcing "at
 *     most one ACTIVE enrollment per (profile, course)" while permitting any
 *     number of dropped ones. This is the rule that makes re-enrollment
 *     possible without allowing genuine duplicates, and it is enforced by the
 *     database rather than only by application code — so a bug in a future
 *     reinstate/re-enroll path cannot store bad data.
 *
 * PRE-FLIGHT: this migration FAILS if duplicates already exist. Run first:
 *
 *   SELECT lead_profile_id, course_id, COUNT(*)
 *   FROM lead_courses GROUP BY 1,2 HAVING COUNT(*) > 1;
 *
 * It must return zero rows. Verified clean on beta 2026-08-06; re-run against
 * production before migrating there.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lead_courses', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    });

    // Effective date the student left — back-datable, so a drop recorded in
    // August for someone who left in July stops counting from July.
    await queryInterface.addColumn('lead_courses', 'dropped_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('lead_courses', 'dropped_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Free text. No controlled vocabulary by design — see constants/enrollment.js.
    await queryInterface.addColumn('lead_courses', 'drop_reason', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    // A returning student's enrollment. Set once at creation and never changed.
    // Read by the revenue and conversion queries: a re-enrollment is company
    // revenue but earns the owning agent nothing, because winning back a
    // student who already bought is not a new sale.
    //
    // Stored rather than derived (from "does an earlier dropped row exist?")
    // because ~6 raw-SQL aggregates read it, where a correlated subquery would
    // be both slower and easy to get subtly wrong.
    await queryInterface.addColumn('lead_courses', 'is_reenrollment', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addIndex('lead_courses', ['status'], {
      name: 'lead_courses_status_idx',
    });

    await queryInterface.addIndex('lead_courses', ['lead_profile_id', 'course_id'], {
      name: 'lead_courses_one_active_per_course',
      unique: true,
      where: { status: 'active' },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('lead_courses', 'lead_courses_one_active_per_course');
    await queryInterface.removeIndex('lead_courses', 'lead_courses_status_idx');
    await queryInterface.removeColumn('lead_courses', 'is_reenrollment');
    await queryInterface.removeColumn('lead_courses', 'drop_reason');
    await queryInterface.removeColumn('lead_courses', 'dropped_by');
    await queryInterface.removeColumn('lead_courses', 'dropped_at');
    await queryInterface.removeColumn('lead_courses', 'status');
  },
};
