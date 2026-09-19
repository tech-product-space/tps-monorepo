import psEnv from "@ps/env/gradient";
import dbHelpers from "@ps/env/db";
import env from "../../config/env.js";

// PG_SCHEMA=gradient in the unified database; unset = standalone, untouched.
const SCHEMA = dbHelpers.searchPathOptions(psEnv.PG_SCHEMA);
const SCHEMA_OPT = dbHelpers.schemaOption(psEnv.PG_SCHEMA);

const CONN = psEnv.DATABASE_URL
  ? { use_env_variable: "DATABASE_URL" }
  : {
      username: env.postgres.username,
      password: env.postgres.password,
      database: env.postgres.database,
      host: env.postgres.host,
      port: env.postgres.port,
    };

export default {
  development: {
    ...CONN,
    ...SCHEMA_OPT,
    dialect: "postgres",
    dialectOptions: {
      ...SCHEMA,
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },

  production: {
    use_env_variable: "DATABASE_URL",
    ...SCHEMA_OPT,
    dialect: "postgres",
    dialectOptions: { ...SCHEMA },
  },
};
