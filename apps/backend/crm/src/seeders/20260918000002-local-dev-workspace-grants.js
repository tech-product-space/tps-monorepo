'use strict';

/**
 * Local dev only: grants the seeded Superadmin (00000000-0000-0000-0000-000000000001)
 * access to the tps and gradient workspaces too, so the unified-admin switcher has
 * something to switch to. Production grants are managed through the admin panel,
 * not seeded — see 20260918000001-create-admin-workspace-grants.js for why a fresh
 * user starts with zero rows here.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('admin_workspace_grants', [
      {
        id: Sequelize.literal('gen_random_uuid()'),
        user_id: '00000000-0000-0000-0000-000000000001',
        workspace: 'tps',
        role: 'Admin',
        granted_by: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal('gen_random_uuid()'),
        user_id: '00000000-0000-0000-0000-000000000001',
        workspace: 'gradient',
        role: 'Admin',
        granted_by: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('admin_workspace_grants', {
      user_id: '00000000-0000-0000-0000-000000000001',
      workspace: ['tps', 'gradient'],
    }, {});
  },
};
