import { Sequelize } from "sequelize";
import env from "../../config/env.js";

// Local Postgres (homebrew/docker for local dev) doesn't speak SSL; the
// managed RDS instance requires it. Skip dialectOptions entirely for
// localhost so sequelize doesn't attempt an SSL handshake against it.
const IS_LOCAL_DB = ["localhost", "127.0.0.1"].includes(env.postgres.host);

const sequelize = new Sequelize(
  env.postgres.database,
  env.postgres.username,
  env.postgres.password,
  {
    host: env.postgres.host,
    port: env.postgres.port,
    logging: false,
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
);

export default sequelize;
