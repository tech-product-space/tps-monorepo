"use strict";

import { ulid } from "ulid";
import { hashPassword } from "../../../util/password.util.js";
import { ADMIN_INVITE_STATUS, ADMIN_ROLES } from "../../../config/constants/admin.js";

/**
 * Idempotent on purpose. `config.js` sets no `seederStorage`, so sequelize-cli
 * keeps no record of what has run and `pg:seed:all` re-executes this every
 * time. The original version inserted blindly: the role landed, the admin user
 * then failed on its unique email, and each run left another orphan
 * "Super Admin" behind in the role dropdown. Cleaned up by
 * 20260810120000-dedupe-admin-role-names.
 */

const EMAIL = "tech@theproductspace.co.in";

export default {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    const [existingRoles] = await sequelize.query(
      "SELECT id FROM admin_roles WHERE name = :name LIMIT 1",
      { replacements: { name: ADMIN_ROLES.SUPER_ADMIN } },
    );

    let roleId = existingRoles[0]?.id;

    if (!roleId) {
      roleId = ulid();

      await queryInterface.bulkInsert("admin_roles", [
        {
          id: roleId,
          name: ADMIN_ROLES.SUPER_ADMIN,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    const [existingUsers] = await sequelize.query(
      "SELECT id FROM admin_users WHERE email = :email LIMIT 1",
      { replacements: { email: EMAIL } },
    );

    if (existingUsers.length) return;

    await queryInterface.bulkInsert("admin_users", [
      {
        id: ulid(),
        roleId,
        name: "Tech Admin",
        email: EMAIL,
        password: await hashPassword("admin@123"),
        isActive: true,
        lastLogin: null,
        inviteStatus: ADMIN_INVITE_STATUS.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("admin_users", { email: EMAIL });

    await queryInterface.bulkDelete("admin_roles", {
      name: ADMIN_ROLES.SUPER_ADMIN,
    });
  },
};
