'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Insert Statuses
    await queryInterface.bulkInsert('statuses', [
      { id: 's_new', label: 'New', color: 'bg-amber-50 text-amber-700 border-amber-100', sort_order: 0, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
      { id: 's_reentry', label: 'Re-entry', color: 'bg-orange-50 text-orange-700 border-orange-100', sort_order: 1, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
      { id: 's_contacted', label: 'Contacted', color: 'bg-blue-50 text-blue-700 border-blue-100', sort_order: 2, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
      { id: 's_interested', label: 'Interested', color: 'bg-indigo-50 text-indigo-700 border-indigo-100', sort_order: 3, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
      { id: 's_followup_scheduled', label: 'Followup Scheduled', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', sort_order: 4, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
      { id: 's_converted', label: 'Converted', color: 'bg-violet-50 text-violet-700 border-violet-100', sort_order: 5, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
      { id: 's_lost', label: 'Lost', color: 'bg-rose-50 text-rose-700 border-rose-100', sort_order: 6, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
      { id: 's_junk', label: 'Junk / Invalid', color: 'bg-zinc-100 text-zinc-600 border-zinc-200', sort_order: 7, is_deactivated: false, created_at: new Date(), updated_at: new Date() },
    ]);

    // Insert Products
    await queryInterface.bulkInsert('products', [
      { id: 'Advanced AI Program', label: 'Advanced AI Program', intent_tier: 'High', is_active: true, sort_order: 0, created_at: new Date(), updated_at: new Date() },
      { id: 'PM Fellowship', label: 'PM Fellowship', intent_tier: 'High', is_active: true, sort_order: 1, created_at: new Date(), updated_at: new Date() },
      { id: 'Interview Course', label: 'Interview Course', intent_tier: 'High', is_active: true, sort_order: 2, created_at: new Date(), updated_at: new Date() },
      { id: 'Gen AI Program', label: 'Gen AI Program', intent_tier: 'High', is_active: true, sort_order: 3, created_at: new Date(), updated_at: new Date() },
      { id: 'AI Builders 101', label: 'AI Builders 101', intent_tier: 'High', is_active: true, sort_order: 4, created_at: new Date(), updated_at: new Date() },
      { id: 'Calcom', label: 'Calcom', intent_tier: 'Low', is_active: true, sort_order: 5, created_at: new Date(), updated_at: new Date() },
      { id: 'General Inquiry', label: 'General Inquiry', intent_tier: 'Low', is_active: true, sort_order: 6, created_at: new Date(), updated_at: new Date() }
    ]);

    // Insert Superadmin
    const defaultPasswordHash = await bcrypt.hash('admin123', 10);
    await queryInterface.bulkInsert('users', [{
      id: '00000000-0000-0000-0000-000000000001', // Static UUID for simplicity
      name: 'Admin',
      email: 'admin@theproductspace.in',
      phone: '+919611232575',
      password_hash: defaultPasswordHash,
      role: 'Superadmin',
      manager_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', { email: 'admin@productspace.com' }, {});
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('statuses', null, {});
  }
};
