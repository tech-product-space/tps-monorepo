'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('razorpay_payment_links', {
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

      razorpay_payment_link_id: {
        type: Sequelize.STRING,
        allowNull: false
      },

      razorpay_payment_id: {
        type: Sequelize.STRING
      },

      razorpay_order_id: {
        type: Sequelize.STRING
      },

      short_url: {
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
      'razorpay_payment_links',
      ['razorpay_payment_link_id']
    );

    await queryInterface.addIndex(
      'razorpay_payment_links',
      ['payment_id']
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('razorpay_payment_links');
  }
};