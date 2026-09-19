import psEnv from "@ps/env/gradient";
import env from "../config/env.js";
import sequelize from "./postgres/sequelize.js";

export async function connectDatabases() {
  try {
    await sequelize.authenticate();
    console.log(`Postgres connected to '${env.postgres.database || "shared database"}'${psEnv.PG_SCHEMA ? ` (schema ${psEnv.PG_SCHEMA})` : ""}`);
  } catch (err) {
    console.error("Database connection error:", err);
    process.exit(1);
  }
}
