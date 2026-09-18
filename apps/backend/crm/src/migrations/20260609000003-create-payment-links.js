'use strict';

/**
 * International payments — unified polymorphic payment_links table.
 *
 * Replaces the per-gateway razorpay_payment_links + cashfree_payment_links
 * tables with a single table keyed by `provider`. Adding a future gateway
 * needs no new table. Existing rows are backfilled here; the two legacy tables
 * are dropped in a later migration once the code cutover is verified.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_links', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'payments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // Gateway key: 'razorpay' | 'cashfree' | …
      provider: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      // Gateway link id used to cancel the link.
      provider_link_id: {
        type: Sequelize.STRING,
      },
      // Hosted payment link URL (Razorpay short_url / Cashfree link_url).
      url: {
        type: Sequelize.STRING,
      },
      // Normalized lowercase link status.
      status: {
        type: Sequelize.STRING(20),
      },
      expire_by: {
        type: Sequelize.DATE,
      },
      // Gateway transaction/order id captured on success.
      provider_ref: {
        type: Sequelize.STRING,
      },
      // Full gateway payload for audit / legacy ids.
      raw: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('payment_links', ['payment_id']);
    await queryInterface.addIndex('payment_links', ['provider_link_id']);
    await queryInterface.addIndex('payment_links', ['provider']);

    // ── Backfill from razorpay_payment_links ──
    await queryInterface.sequelize.query(`
      INSERT INTO payment_links
        (id, payment_id, provider, provider_link_id, url, status, expire_by, provider_ref, raw, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        payment_id,
        'razorpay',
        razorpay_payment_link_id,
        short_url,
        status,
        expire_by,
        razorpay_payment_id,
        jsonb_build_object(
          'razorpay_payment_id', razorpay_payment_id,
          'razorpay_order_id', razorpay_order_id
        ),
        created_at,
        updated_at
      FROM razorpay_payment_links
    `);

    // ── Backfill from cashfree_payment_links ──
    await queryInterface.sequelize.query(`
      INSERT INTO payment_links
        (id, payment_id, provider, provider_link_id, url, status, expire_by, provider_ref, raw, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        payment_id,
        'cashfree',
        link_id,
        link_url,
        status,
        expire_by,
        cf_order_id,
        jsonb_build_object(
          'cf_link_id', cf_link_id,
          'cf_order_id', cf_order_id
        ),
        created_at,
        updated_at
      FROM cashfree_payment_links
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('payment_links');
  },
};
