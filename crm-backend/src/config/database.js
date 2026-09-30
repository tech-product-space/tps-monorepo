require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Connection-pool sizing. Sequelize's default is `max: 5` with a 60s acquire
// timeout, which is what produced the production
//   ConnectionAcquireTimeoutError: Operation timeout
// on GET /leads: a single list request makes ~10 sequential round-trips (auth,
// agent scope, product/subsource grants, count, rows, history), so a handful of
// concurrent users can hold all five slots for longer than the acquire window.
// The failure surfaces on whichever query asks for a connection first, which is
// why the stack always pointed at applyAgentScope rather than at the real cost.
//
// `min: 2` keeps warm connections around: this DB is a remote RDS in ap-south-1,
// so a cold pool makes every burst pay a fresh TLS handshake.
//
// Sized via env so prod can be tuned without a deploy. Mirrors the same block in
// tps-next-backend/config/config.js.
const POOL = {
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  acquire: parseInt(process.env.DB_POOL_ACQUIRE_MS || '30000', 10),
  idle: parseInt(process.env.DB_POOL_IDLE_MS || '10000', 10),
};

// ps-v3: local Postgres on the same box, no SSL listener, "crm" schema
// (shared productspace DB, one schema per service — see
// ps-v3/PROJECT_README.md). DB_SSL=true restores the old RDS-style block.
const useSsl = process.env.DB_SSL === 'true';
const SCHEMA = process.env.DB_SCHEMA || 'crm';
// search_path matters for unqualified table refs in migrations — define.schema
// alone doesn't cover queryInterface.createTable() calls.
const dialectOptions = { ...(useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {}), options: `-c search_path=${SCHEMA}` };
const DEFINE = { schema: SCHEMA };
const MIGRATION_SCHEMA = { migrationStorageTableSchema: process.env.DB_SCHEMA || 'crm' };

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    pool: POOL,
    define: DEFINE,
    ...MIGRATION_SCHEMA,
    dialectOptions,
    logging: false
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    pool: POOL,
    define: DEFINE,
    ...MIGRATION_SCHEMA,
    logging: false
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    pool: POOL,
    define: DEFINE,
    ...MIGRATION_SCHEMA,
    dialectOptions,
    logging: false
  }
};
