'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoices', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },

      // Sequential number within the financial year (1, 2, 3…)
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // Formatted number: TPS/25-26/0001
      invoice_number: {
        type: Sequelize.STRING(30),
        allowNull: false,
        unique: true,
      },

      // The financial year label this invoice belongs to (e.g. "25-26")
      financial_year: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },

      lead_course_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'lead_courses', key: 'id' },
        onDelete: 'CASCADE',
      },

      generated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },

      // Snapshot of buyer details at generation time
      buyer_name: { type: Sequelize.STRING(150), allowNull: true },
      buyer_email: { type: Sequelize.STRING(255), allowNull: true },

      // Total amounts at generation time (paise/cents)
      total_amount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      taxable_amount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      gst_amount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },

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

    await queryInterface.addIndex('invoices', ['lead_course_id']);
    await queryInterface.addIndex('invoices', ['financial_year', 'sequence']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invoices');
  },
};
