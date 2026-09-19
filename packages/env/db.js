/**
 * One Postgres database, one schema per brand (tps / gradient / crm).
 *
 * Every connection a brand opens — the Sequelize runtime pool, sequelize-cli
 * migrations, Agenda's own pg pool — sets `search_path` to the brand's schema at
 * connect time. Models, raw SQL, FK `references` and enum types then resolve to
 * the right tables without a single table name changing, and each schema gets
 * its own SequelizeMeta.
 *
 * PG_SCHEMA unset = leave search_path alone, so a package still runs standalone
 * against its old, dedicated database. The gateway refuses to boot a brand in a
 * shared database without it (see apps/api/lib/brands.js).
 *
 * This relies on Postgres's `options` startup parameter, which works against RDS
 * directly but not through PgBouncer in transaction-pooling mode.
 */
const IDENT = /^[a-z_][a-z0-9_]*$/;

function assertSchema(schema) {
  if (!IDENT.test(schema)) throw new Error(`Invalid PG_SCHEMA "${schema}" (lowercase letters, digits, underscore)`);
  return schema;
}

// Spread into Sequelize `dialectOptions`.
function searchPathOptions(schema) {
  if (!schema) return {};
  return { options: `-c search_path=${assertSchema(schema)},public` };
}

// Spread into the *top level* of the Sequelize options (not dialectOptions).
// search_path alone is not enough: Sequelize's queryInterface (addColumn,
// describeTable, tableExists, renameColumn, ...) qualifies bare table names as
// "public"."<table>" unless it is told a default schema, which every migration
// would trip over. Model queries are unaffected by this option.
function schemaOption(schema) {
  return schema ? { schema: assertSchema(schema) } : {};
}

// Append to a postgres:// connection string (for libraries that build their own pool).
function withSearchPath(connectionString, schema) {
  if (!schema) return connectionString;
  const u = new URL(connectionString);
  u.searchParams.set("options", `-c search_path=${assertSchema(schema)},public`);
  return u.toString();
}

module.exports = { searchPathOptions, schemaOption, withSearchPath, assertSchema };
