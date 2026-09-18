import { Sequelize } from "sequelize";
import env from "../../config/env.js";

const sequelize = new Sequelize(
  env.postgres.database,
  env.postgres.username,
  env.postgres.password,
  {
    host: env.postgres.host,
    port: env.postgres.port,
    logging: false,
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
);

export default sequelize;
