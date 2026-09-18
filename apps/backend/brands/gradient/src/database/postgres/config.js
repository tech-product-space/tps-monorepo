import env from "../../config/env.js";

export default {
  development: {
    username: env.postgres.username,
    password: env.postgres.password,
    database: env.postgres.database,
    host: env.postgres.host,
    port: env.postgres.port,
    dialect: "postgres",
    dialectOptions: {
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
