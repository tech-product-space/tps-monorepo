const psEnv = require("@ps/env/tps");
const { searchPathOptions, schemaOption } = require("@ps/env/db");
require("dotenv").config(); // Load environment variables

const CAN_DB_LOG = psEnv.DB_LOGGER === "true"

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
  max: parseInt(psEnv.DB_POOL_MAX || "20", 10),
  min: parseInt(psEnv.DB_POOL_MIN || "0", 10),
  acquire: parseInt(psEnv.DB_POOL_ACQUIRE_MS || "30000", 10),
  idle: parseInt(psEnv.DB_POOL_IDLE_MS || "10000", 10),
};

// Unified deployment: one DATABASE_URL shared by all brands + PG_SCHEMA=tps.
// Standalone (old .env): DB_HOST/DB_NAME/... exactly as before.
const SCHEMA = searchPathOptions(psEnv.PG_SCHEMA);
const SCHEMA_OPT = schemaOption(psEnv.PG_SCHEMA);
const CONN = psEnv.DATABASE_URL
  ? { use_env_variable: "DATABASE_URL" }
  : {
      username: psEnv.DB_USER,
      password: psEnv.DB_PASS,
      database: psEnv.DB_NAME,
      host: psEnv.DB_HOST,
      port: psEnv.DB_PORT,
    };

module.exports = {
  development: {
    ...CONN,
    ...SCHEMA_OPT,
    dialect: "postgres",
    pool: POOL,
    dialectOptions: {
      ...SCHEMA,
      ssl: {
        rejectUnauthorized: false,
      },
    },
    logging: CAN_DB_LOG ? console.log : false,
  },
  test: {
    ...CONN,
    ...SCHEMA_OPT,
    dialect: "postgres",
    pool: POOL,
    dialectOptions: {
      ...SCHEMA,
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    logging: CAN_DB_LOG ? console.log : false,
  },
  production: {
    ...CONN,
    ...SCHEMA_OPT,
    dialect: "postgres",
    pool: POOL,
    dialectOptions: {
      ...SCHEMA,
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: CAN_DB_LOG ? console.log : false,
  }
};
