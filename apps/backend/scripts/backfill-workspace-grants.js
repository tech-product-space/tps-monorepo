/**
 * One-off backfill: gives every existing TPS staff (`company` table in
 * tps_db) and Gradient admin (`admin_users` table in gradient_db) a matching
 * `admin_workspace_grants` row in crm_db, keyed by email.
 *
 * Why this has to be a script, not a migration: migration 20260918000001 (in
 * crm/src/migrations) backfills the `crm` workspace from `users` because
 * that table lives in the SAME database it runs against. `company` and
 * `admin_users` live in tps_db and gradient_db respectively — separate
 * Postgres databases by design (see BACKEND-CONSOLIDATION-PLAN.md §2) — so a
 * single SQL migration can't join across them. This connects to all three
 * directly instead.
 *
 * What it does NOT do: create a `users` row for someone who only exists in
 * `company`/`admin_users` and never in CRM's `users` table. Identity is
 * canonical in `users` now (§7.2) — an admin with no CRM `users` row has
 * never logged in through the unified flow and has nothing to grant yet.
 * Those are reported at the end, not silently created, since inventing a
 * password-less `users` row for them is a judgment call for whoever runs
 * this, not something to do unattended.
 *
 * Usage:
 *   DATABASE_URL_TPS=... DATABASE_URL_GRADIENT=... DATABASE_URL_CRM=... \
 *     node scripts/backfill-workspace-grants.js [--dry-run]
 */
const { Sequelize, DataTypes, QueryTypes } = require("sequelize");

const DRY_RUN = process.argv.includes("--dry-run");

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
};

async function main() {
  const tpsDb = new Sequelize(need("DATABASE_URL_TPS"), { logging: false, dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } });
  const gradientDb = new Sequelize(need("DATABASE_URL_GRADIENT"), { logging: false, dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } });
  const crmDb = new Sequelize(need("DATABASE_URL_CRM"), { logging: false, dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } });

  await Promise.all([tpsDb.authenticate(), gradientDb.authenticate(), crmDb.authenticate()]);

  const tpsStaff = await tpsDb.query(
    `SELECT email, role FROM company WHERE email IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  const gradientAdmins = await gradientDb.query(
    `SELECT au.email, ar.name AS role
     FROM admin_users au
     JOIN admin_roles ar ON ar.id = au."roleId"
     WHERE au."isActive" = true`,
    { type: QueryTypes.SELECT }
  );

  const crmUsers = await crmDb.query(
    `SELECT id, email FROM users WHERE is_active = true`,
    { type: QueryTypes.SELECT }
  );
  const crmUserByEmail = new Map(crmUsers.map((u) => [u.email.toLowerCase().trim(), u.id]));

  const toGrant = []; // { user_id, workspace, role }
  const unmatched = []; // { email, workspace } — no crm `users` row yet

  for (const staff of tpsStaff) {
    const email = staff.email.toLowerCase().trim();
    const userId = crmUserByEmail.get(email);
    if (!userId) {
      unmatched.push({ email, workspace: "tps" });
      continue;
    }
    toGrant.push({ user_id: userId, workspace: "tps", role: staff.role || "Admin" });
  }

  for (const admin of gradientAdmins) {
    const email = admin.email.toLowerCase().trim();
    const userId = crmUserByEmail.get(email);
    if (!userId) {
      unmatched.push({ email, workspace: "gradient" });
      continue;
    }
    toGrant.push({ user_id: userId, workspace: "gradient", role: admin.role || "Admin" });
  }

  console.log(`Would grant ${toGrant.length} workspace row(s); ${unmatched.length} admin(s) have no CRM users row yet.`);

  if (unmatched.length) {
    console.log("\nUnmatched (need a CRM `users` row created manually before they can be granted):");
    unmatched.forEach((u) => console.log(`  ${u.email} (${u.workspace})`));
  }

  if (DRY_RUN) {
    console.log("\n--dry-run set, not writing anything.");
    return;
  }

  for (const grant of toGrant) {
    await crmDb.query(
      `INSERT INTO admin_workspace_grants (id, user_id, workspace, role, created_at, updated_at)
       VALUES (gen_random_uuid(), :user_id, :workspace, :role, NOW(), NOW())
       ON CONFLICT (user_id, workspace) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
      { replacements: grant }
    );
  }

  console.log(`\nWrote ${toGrant.length} workspace grant(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
