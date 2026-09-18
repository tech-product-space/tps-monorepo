'use strict';

/**
 * Backs the unified-admin login (tps-monorepo/apps/admin). One row = "this
 * user may access this workspace, holding this role while there".
 *
 * A user with zero rows here can still log in (their `users.role` is their
 * implicit CRM-workspace role, preserved for backward compatibility — see the
 * backfill below) but sees no Gradient/TPS workspace in the switcher until a
 * grant is added. Multiple rows per user are expected: someone can be
 * `Manager` in `crm` and `Admin` in `gradient` at the same time, and those
 * roles are independent of each other.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_workspace_grants', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // 'gradient' | 'tps' | 'crm'
      workspace: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      // Role string, meaningful only within `workspace` — e.g. Superadmin/
      // Manager/Agent/ProgramManager for crm, Admin/Superadmin/Creator/Sales
      // for tps, Admin for gradient. Not validated against a shared enum
      // because each workspace's role set is defined by that workspace's own
      // backend, not by this table.
      role: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      granted_by: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('admin_workspace_grants', {
      name: 'admin_workspace_grants_unique_user_workspace',
      unique: true,
      fields: ['user_id', 'workspace'],
    });

    // Backfill: every existing CRM user implicitly has a `crm` workspace grant
    // at their current role, so nobody loses access the day this ships.
    await queryInterface.sequelize.query(`
      INSERT INTO admin_workspace_grants (id, user_id, workspace, role, created_at, updated_at)
      SELECT uuid_generate_v4(), id, 'crm', role, NOW(), NOW()
      FROM users
      WHERE is_active = true
      ON CONFLICT DO NOTHING;
    `).catch(async () => {
      // uuid_generate_v4() requires the uuid-ossp extension; fall back to
      // Postgres 13+'s built-in gen_random_uuid() if that extension isn't enabled.
      await queryInterface.sequelize.query(`
        INSERT INTO admin_workspace_grants (id, user_id, workspace, role, created_at, updated_at)
        SELECT gen_random_uuid(), id, 'crm', role, NOW(), NOW()
        FROM users
        WHERE is_active = true
        ON CONFLICT DO NOTHING;
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_workspace_grants');
  },
};
