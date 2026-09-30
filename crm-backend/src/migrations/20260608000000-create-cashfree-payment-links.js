'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cashfree_payment_links', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },

      payment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'payments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      // Merchant-provided link id (we set this to the payment id).
      link_id: {
        type: Sequelize.STRING,
        allowNull: false
      },

      // Cashfree's internal numeric link id.
      cf_link_id: {
        type: Sequelize.STRING
      },

      // Cashfree order id, captured from the webhook when paid.
      cf_order_id: {
        type: Sequelize.STRING
      },

      // Hosted payment link URL (equivalent to Razorpay's short_url).
      link_url: {
        type: Sequelize.STRING
      },

      status: {
        type: Sequelize.STRING
      },

      expire_by: {
        type: Sequelize.DATE
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    await queryInterface.addIndex(
      'cashfree_payment_links',
      ['link_id']
    );

    await queryInterface.addIndex(
      'cashfree_payment_links',
      ['payment_id']
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('cashfree_payment_links');
  }
};
