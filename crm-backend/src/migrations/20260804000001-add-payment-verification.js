'use strict';

/**
 * Manual-payment verification.
 *
 * A manually-recorded payment no longer counts as money the moment it is
 * entered — a Superadmin or Program Manager must approve it first. The state
 * lives in `verification_status`, which is deliberately a plain STRING(20)
 * (like `source`) rather than a Postgres ENUM, so adding a future state is an
 * app-level change instead of an `ALTER TYPE ... ADD VALUE`.
 *
 * The discriminator, read together with the existing `status` column:
 *
 *   verification_status IS NULL      -> gateway payment (or a legacy row);
 *                                       `status` means what it always meant.
 *   verification_status = 'pending'  -> manual, awaiting approval  (status='pending')
 *   verification_status = 'verified' -> manual, approved           (status='paid')
 *   verification_status = 'rejected' -> manual, rejected           (status='cancelled')
 *
 * Keeping unverified money OUT of status='paid' is the whole point: ~30 revenue
 * / dues / receipt queries already filter on status='paid', so they exclude
 * unverified payments with no code change. Adding a filter to each of those
 * instead would fail open — one missed query leaks unverified money into
 * revenue.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'verification_status', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('payments', 'verified_by', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('payments', 'verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('payments', 'rejection_reason', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
    });

    // A rejected payment is immutable; a correction is a NEW row pointing back
    // at the one it replaces, so the original claim survives in the audit trail.
    await queryInterface.addColumn('payments', 'supersedes_payment_id', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: { model: 'payments', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // The verification queue reads only the pending slice — a partial index
    // keeps it tiny regardless of how many payments accumulate.
    await queryInterface.sequelize.query(`
      CREATE INDEX payments_verification_pending_idx
        ON payments (created_at)
        WHERE verification_status = 'pending'
    `);

    await queryInterface.addIndex('payments', {
      name: 'payments_verification_status_idx',
      fields: ['verification_status'],
    });

    // Grandfather every historical manual payment as verified. `status` is
    // deliberately left alone, so no past revenue figure moves and the queue is
    // empty on day one. Gateway rows keep verification_status = NULL.
    await queryInterface.sequelize.query(`
      UPDATE payments
         SET verification_status = 'verified'
       WHERE status = 'paid'
         AND source = 'bank_transfer'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS payments_verification_pending_idx',
    );
    await queryInterface.removeIndex('payments', 'payments_verification_status_idx');
    await queryInterface.removeColumn('payments', 'supersedes_payment_id');
    await queryInterface.removeColumn('payments', 'rejection_reason');
    await queryInterface.removeColumn('payments', 'verified_at');
    await queryInterface.removeColumn('payments', 'verified_by');
    await queryInterface.removeColumn('payments', 'verification_status');
  },
};
