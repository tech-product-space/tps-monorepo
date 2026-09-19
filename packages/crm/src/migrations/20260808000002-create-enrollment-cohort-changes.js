'use strict';

/**
 * Audit trail for cohort deferrals — one row per move.
 *
 * lead_courses only ever holds two cohorts: where the student started
 * (original_cohort_id) and where they are now (cohort_id). Every hop in between
 * lives here, so a student deferred twice can be reconstructed in full: who
 * moved them, when it took effect, why, and what it cost.
 *
 * Both cohort names are snapshotted alongside their ids for the same reason
 * lead_courses.cohort_name is: the FKs are ON DELETE SET NULL, and a cohort that
 * is later renamed or removed must not erase the history that references it.
 *
 * deferral_payment_id links the fee to the payment it produced, so the expanded
 * enrollment row can show the fee's verification state without guessing which
 * payment on the enrollment was the fee. (payments.purpose answers the same
 * question in aggregate; this answers it per move.)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('enrollment_cohort_changes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },

      lead_course_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'lead_courses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      from_cohort_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'cohorts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      from_cohort_name: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },

      to_cohort_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'cohorts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      to_cohort_name: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },

      // Required, min 5 chars — same rule as drop_reason, and free text for the
      // same reason: reasons are not aggregatable without reading them.
      reason: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },

      // When the move takes effect. Back-datable within [enrolled_at, now].
      effective_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      deferral_fee_amount: {
        type: Sequelize.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0,
      },

      // The payment created for the fee, when one was collected at the time of
      // the move. NULL when the fee was only added to the balance, or when no
      // fee was charged.
      deferral_payment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'payments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      changed_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('enrollment_cohort_changes', ['lead_course_id', 'created_at'], {
      name: 'enrollment_cohort_changes_course_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('enrollment_cohort_changes');
  },
};
