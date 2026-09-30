require("dotenv").config();
const { Sequelize } = require("sequelize");

// ps-v3: local Postgres on the same box has no SSL listener and lives in the
// "tps" schema (shared productspace DB, one schema per service — see
// ps-v3/PROJECT_README.md). DB_SSL defaults off; set DB_SSL=true to restore
// the old RDS-style connection if this ever points at a managed instance again.
const useSsl = process.env.DB_SSL === "true";
const SCHEMA = process.env.DB_SCHEMA || "tps";

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    pool: {
        max: 30,
        min: 2,
        acquire: 60000,
        idle: 10000,
    },
    define: {
        schema: SCHEMA,
    },
    // search_path is what actually matters for unqualified table refs
    // (migrations, raw queries) — define.schema alone doesn't cover those.
    dialectOptions: {
        ...(useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {}),
        options: `-c search_path=${SCHEMA}`,
    },
});

module.exports = sequelize;