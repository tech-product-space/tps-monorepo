import { Sequelize } from "sequelize";
import env from "../../config/env.js";

// ps-v3: local Postgres on the same box, no SSL listener, "gradient" schema
// (shared productspace DB, one schema per service — see
// ../../../../PROJECT_README.md). DB_SSL=true restores the old RDS-style block.
const useSsl = process.env.DB_SSL === "true";
const SCHEMA = process.env.DB_SCHEMA || "gradient";

const sequelize = new Sequelize(
  env.postgres.database,
  env.postgres.username,
  env.postgres.password,
  {
    host: env.postgres.host,
    port: env.postgres.port,
    logging: false,
    dialect: "postgres",
    define: {
      schema: SCHEMA,
    },
    // search_path is what actually matters for unqualified table refs
    // (migrations, raw queries) — define.schema alone doesn't cover those.
    dialectOptions: {
      ...(useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {}),
      options: `-c search_path=${SCHEMA}`,
    },
    pool: {
      max: 30,
      min: 2,
      acquire: 60000,
      idle: 10000,
    },
  },
);

export default sequelize;
