import env from "../../config/env.js";

// Local Postgres (homebrew/docker for local dev) doesn't speak SSL; the
// managed RDS instance requires it. Skip dialectOptions entirely for
// localhost so sequelize-cli doesn't attempt an SSL handshake against it.
const IS_LOCAL_DB = ["localhost", "127.0.0.1"].includes(env.postgres.host);

export default {
  development: {
    username: env.postgres.username,
    password: env.postgres.password,
    database: env.postgres.database,
    host: env.postgres.host,
    port: env.postgres.port,
    dialect: "postgres",
    dialectOptions: IS_LOCAL_DB
      ? {}
      : {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },
  },

  production: {
    use_env_variable: "DATABASE_URL",
    dialect: "postgres",
  },
};
