require("dotenv").config(); // Load environment variables

const CAN_DB_LOG = process.env.DB_LOGGER === "true"

// Connection-pool sizing. The default Sequelize pool max is 5, which is
// well below the workflow worker's advance concurrency (default 10) plus
// the API server's request traffic. Under bursts the extra advances queue
// up on pool.acquire and time out with "Operation timeout", which the
// workflow engine used to surface as a permanent enrollment failure.
//
// We expose the size via DB_POOL_MAX so prod can tune it without a code
// change, but default to 20 — comfortably above WORKER_CONCURRENCY=10 and
// still well under managed-Postgres connection limits (typically 100+).
const POOL = {
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  min: parseInt(process.env.DB_POOL_MIN || "0", 10),
  acquire: parseInt(process.env.DB_POOL_ACQUIRE_MS || "30000", 10),
  idle: parseInt(process.env.DB_POOL_IDLE_MS || "10000", 10),
};

// ps-v3: local Postgres, no SSL listener, "tps" schema. DB_SSL=true restores
// the old RDS-style block. See config/db.js for the matching app-side change.
const useSsl = process.env.DB_SSL === "true";
// search_path (not just define.schema) is what actually matters here — migration
// files call queryInterface.createTable() unqualified, which resolves against
// whatever schema is first in search_path, not against define.schema.
const SCHEMA = process.env.DB_SCHEMA || "tps";
const dialectOptions = { ...(useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {}), options: `-c search_path=${SCHEMA}` };
const DEFINE = { schema: SCHEMA };
const MIGRATION_SCHEMA = { migrationStorageTableSchema: process.env.DB_SCHEMA || "tps" };

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    pool: POOL,
    define: DEFINE,
    ...MIGRATION_SCHEMA,
    dialectOptions,
    logging: CAN_DB_LOG ? console.log : false,
  },
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    pool: POOL,
    define: DEFINE,
    ...MIGRATION_SCHEMA,
    dialectOptions,
    logging: CAN_DB_LOG ? console.log : false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    pool: POOL,
    define: DEFINE,
    ...MIGRATION_SCHEMA,
    dialectOptions,
    logging: CAN_DB_LOG ? console.log : false,
  }
};
