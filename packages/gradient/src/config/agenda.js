import { Agenda } from "agenda";
import { PostgresBackend } from "@agendajs/postgres-backend";
import psEnv from "@ps/env/gradient";
import dbHelpers from "@ps/env/db";
import env from "./env.js";

const { withSearchPath } = dbHelpers;

// Agenda opens its own pg pool, so it has to be pointed at the gradient schema
// itself (agenda_jobs must not land in another brand's schema or in public).
// Unified deployment: shared DATABASE_URL. Standalone: POSTGRES_* as before.
const baseConnectionString = psEnv.DATABASE_URL
  ? `${psEnv.DATABASE_URL}${psEnv.DATABASE_URL.includes("?") ? "&" : "?"}sslmode=no-verify`
  : `postgresql://${env.postgres.username}:${env.postgres.password}@${env.postgres.host}:${env.postgres.port}/${env.postgres.database}?sslmode=no-verify`;
const connectionString = withSearchPath(baseConnectionString, psEnv.PG_SCHEMA);

// Create agenda with PostgreSQL backend
const agenda = new Agenda({
  backend: new PostgresBackend({
    connectionString,
    tableName: "agenda_jobs",
  }),
});

if (env.agendaEnabled) {
  agenda.on("ready", async () => {
    (async () => {
      await agenda.start();
      console.log(`🟢 Agenda connected to '${psEnv.PG_SCHEMA || env.postgres.database}'`);
    })();
  });

  agenda.on("error", (err) => {
    console.error("❌ Agenda error:", err);
  });

  agenda.on("fail", async (err, job) => {
    if (job.attrs.failCount >= 3) {
      console.error("🚨 Job permanently failed:", job.attrs.name);

      //   await sendAdminAlert(
      //     `Agenda Job Failed: ${job.attrs.name}`,
      //     `
      //     Job Name: ${job.attrs.name}
      //     Fail Count: ${job.attrs.failCount}
      //     Data: ${JSON.stringify(job.attrs.data)}
      //     Reason: ${err.message}
      //   `,
      //   );
    }
  });
} else {
  console.log("🔴 Agenda Disabled by ENV");
}

export default agenda;