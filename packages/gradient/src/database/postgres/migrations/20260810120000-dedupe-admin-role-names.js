"use strict";

/**
 * Collapses duplicate `admin_roles` rows by name and adds the unique index that
 * should always have been there.
 *
 * How they got in: `config.js` sets no `seederStorage`, so sequelize-cli
 * defaults to "none" — it records nothing and re-runs every seeder on each
 * `pg:seed:all`. The Super Admin seeder inserts the role first and the admin
 * user second; `admin_users.email` is unique, so on a re-run the user insert
 * fails *after* the role row has already committed. One orphan role per run,
 * each one showing up as another "Super Admin" in the panel's role dropdown.
 *
 * The keeper per name is the row with the most users (tie-break: oldest), so
 * the common case rewrites nothing — the duplicates are typically orphans.
 */

// Ranks rows within each name so "which one survives" is defined once.
const RANKED = `
  SELECT
    r.id,
    r.name,
    ROW_NUMBER() OVER (
      PARTITION BY r.name
      ORDER BY
        (SELECT COUNT(*) FROM admin_users u WHERE u."roleId" = r.id) DESC,
        r."createdAt" ASC,
        r.id ASC
    ) AS rn
  FROM admin_roles r
`;

export default {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    await sequelize.transaction(async (transaction) => {
      // 1. Move any admin off a doomed row onto the keeper for that name.
      await sequelize.query(
        `
        WITH ranked AS (${RANKED}),
        keepers AS (SELECT id, name FROM ranked WHERE rn = 1),
        losers  AS (SELECT id, name FROM ranked WHERE rn > 1)
        UPDATE admin_users u
        SET "roleId" = keepers.id, "updatedAt" = NOW()
        FROM losers
        JOIN keepers ON keepers.name = losers.name
        WHERE u."roleId" = losers.id
        `,
        { transaction },
      );

      // 2. Drop the now-unreferenced duplicates.
      await sequelize.query(
        `
        WITH ranked AS (${RANKED})
        DELETE FROM admin_roles
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        `,
        { transaction },
      );

      // 3. Make it unrepeatable. Exact-match, which is what `createRole`'s
      //    duplicate check already does — "super admin" and "Super Admin" stay
      //    distinct names.
      await queryInterface.addIndex("admin_roles", ["name"], {
        name: "admin_roles_name_unique",
        unique: true,
        transaction,
      });
    });
  },

  async down(queryInterface) {
    // Only the index comes back off. The merged rows are gone for good — that
    // is the point of the migration, and re-splitting them would invent ids
    // nothing referenced.
    await queryInterface.removeIndex("admin_roles", "admin_roles_name_unique");
  },
};
