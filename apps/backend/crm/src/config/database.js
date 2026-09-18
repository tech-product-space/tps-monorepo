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

// Local Postgres (homebrew/docker for local dev) doesn't speak SSL; the
// managed RDS instance requires it. Skip dialectOptions entirely when
// DATABASE_URL points at localhost so sequelize doesn't attempt an SSL
// handshake against it.
const IS_LOCAL_DB = /^postgres(?:ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1)[:/]/.test(
  process.env.DATABASE_URL || ''
);

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    pool: POOL,
    dialectOptions: IS_LOCAL_DB
      ? {}
      : {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        },
    logging: false
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    pool: POOL,
    logging: false
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    pool: POOL,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  }
};
