const psEnv = require("@ps/env/crm");
const { searchPathOptions, schemaOption } = require("@ps/env/db");
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
  max: parseInt(psEnv.DB_POOL_MAX || '20', 10),
  min: parseInt(psEnv.DB_POOL_MIN || '2', 10),
  acquire: parseInt(psEnv.DB_POOL_ACQUIRE_MS || '30000', 10),
  idle: parseInt(psEnv.DB_POOL_IDLE_MS || '10000', 10),
};

// PG_SCHEMA=crm in the unified database; unset = standalone, search_path untouched.
const SCHEMA = searchPathOptions(psEnv.PG_SCHEMA);
const SCHEMA_OPT = schemaOption(psEnv.PG_SCHEMA);

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    ...SCHEMA_OPT,
    dialect: 'postgres',
    pool: POOL,
    dialectOptions: {
      ...SCHEMA,
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    ...SCHEMA_OPT,
    dialect: 'postgres',
    pool: POOL,
    dialectOptions: { ...SCHEMA },
    logging: false
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    ...SCHEMA_OPT,
    dialect: 'postgres',
    pool: POOL,
    dialectOptions: {
      ...SCHEMA,
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  }
};
