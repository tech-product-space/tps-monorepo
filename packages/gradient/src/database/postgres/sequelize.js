import { Sequelize } from "sequelize";
import psEnv from "@ps/env/gradient";
import dbHelpers from "@ps/env/db";
import env from "../../config/env.js";

const { searchPathOptions, schemaOption } = dbHelpers;

// Unified deployment: shared DATABASE_URL + PG_SCHEMA=gradient.
// Standalone (old .env): POSTGRES_* exactly as before.
const options = {
  ...schemaOption(psEnv.PG_SCHEMA),
  logging: false,
  dialect: "postgres",
  dialectOptions: {
    ...searchPathOptions(psEnv.PG_SCHEMA),
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
};

const sequelize = psEnv.DATABASE_URL
  ? new Sequelize(psEnv.DATABASE_URL, options)
  : new Sequelize(env.postgres.database, env.postgres.username, env.postgres.password, {
      host: env.postgres.host,
      port: env.postgres.port,
      ...options,
    });

export default sequelize;
