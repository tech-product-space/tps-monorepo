import env from "../../config/env.js";

// ps-v3: local Postgres, no SSL listener, "gradient" schema. DB_SSL=true
// restores the old RDS-style block. This file also controls where
// `pg:migrate` creates tables — the schema must be set here too, not just
// in sequelize.js, or migrations will land in "public" instead.
const useSsl = process.env.DB_SSL === "true";
const SCHEMA = process.env.DB_SCHEMA || "gradient";
// search_path matters for unqualified table refs in migrations — define.schema
// alone doesn't cover queryInterface.createTable() calls.
const dialectOptions = { ...(useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {}), options: `-c search_path=${SCHEMA}` };
const DEFINE = { schema: SCHEMA };
const MIGRATION_SCHEMA = { migrationStorageTableSchema: SCHEMA };

export default {
  development: {
    username: env.postgres.username,
    password: env.postgres.password,
    database: env.postgres.database,
    host: env.postgres.host,
    port: env.postgres.port,
    dialect: "postgres",
    define: DEFINE,
    ...MIGRATION_SCHEMA,
    dialectOptions,
  },

  production: {
    use_env_variable: "DATABASE_URL",
    dialect: "postgres",
    define: DEFINE,
    ...MIGRATION_SCHEMA,
  },
};
