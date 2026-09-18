'use strict';

/**
 * Generic, forward-scalable permission-grant table.
 *
 * One row = "this principal is granted (or denied) this action on this resource".
 * Today it powers product/subsource `view` access; new resource types, actions,
 * principal kinds, and allow/deny exceptions are all expressible as ROWS — no
 * future schema change required.
 *
 * Default-open rule (enforced in permission.service, not the schema): a resource
 * with ZERO grant rows for an action is accessible to everyone.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('access_grants', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      // 'product' | 'subsource'  (future: 'report', 'dashboard', 'cohort', ...)
      resource_type: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      // specific resource id; NULL = a type-wide grant (e.g. "all reports")
      resource_id: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      // 'role' | 'user'  (future: 'team', 'everyone')
      principal_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      // role name / user uuid; NULL when principal_type = 'everyone'
      principal_id: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      // 'view' today (future: 'edit', 'delete', 'export', 'manage')
      action: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'view',
      },
      // 'allow' today; 'deny' reserved for future exception rules
      effect: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: 'allow',
      },
      created_by: {
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

    // Prevent duplicate grants. NULLs in Postgres are distinct, which is fine
    // here — everyone/type-wide rows are few and controller-managed.
    await queryInterface.addIndex('access_grants', {
      name: 'access_grants_unique_grant',
      unique: true,
      fields: [
        'resource_type',
        'resource_id',
        'principal_type',
        'principal_id',
        'action',
        'effect',
      ],
    });

    // Hot path: "who can do <action> on <resource>?"
    await queryInterface.addIndex('access_grants', {
      name: 'access_grants_resource_action',
      fields: ['resource_type', 'resource_id', 'action'],
    });

    // Reverse lookup: "what can this principal reach?"
    await queryInterface.addIndex('access_grants', {
      name: 'access_grants_principal',
      fields: ['principal_type', 'principal_id'],
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('access_grants');
  },
};
