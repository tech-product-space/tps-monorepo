'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('business_settings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },

      // ── Identity ──
      legal_name: { type: Sequelize.STRING(200), allowNull: true },
      trade_name: { type: Sequelize.STRING(150), allowNull: true },

      // ── Tax ──
      gstin: { type: Sequelize.STRING(20), allowNull: true },
      gst_percent: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 18 },

      // ── Address ──
      address_line1: { type: Sequelize.STRING(200), allowNull: true },
      address_line2: { type: Sequelize.STRING(200), allowNull: true },
      city: { type: Sequelize.STRING(100), allowNull: true },
      state: { type: Sequelize.STRING(100), allowNull: true },
      pincode: { type: Sequelize.STRING(20), allowNull: true },
      country: { type: Sequelize.STRING(100), allowNull: true },

      // ── Contact ──
      email: { type: Sequelize.STRING(255), allowNull: true },
      website: { type: Sequelize.STRING(255), allowNull: true },
      phone: { type: Sequelize.STRING(50), allowNull: true },

      // ── Branding ── (uploaded logo stored as a base64 data URI)
      logo_url: { type: Sequelize.TEXT, allowNull: true },

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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('business_settings');
  },
};
