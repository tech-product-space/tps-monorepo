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

// Local Postgres (homebrew/docker for local dev) doesn't speak SSL; the
// managed RDS instance requires it. Skip dialectOptions entirely for
// localhost so sequelize doesn't attempt an SSL handshake against it.
const IS_LOCAL_DB = ["localhost", "127.0.0.1"].includes(process.env.DB_HOST);

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    pool: POOL,
    dialectOptions: IS_LOCAL_DB
      ? {}
      : {
          ssl: {
            rejectUnauthorized: false,
          },
        },
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
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
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
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: CAN_DB_LOG ? console.log : false,
  }
};
