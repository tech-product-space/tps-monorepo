import { Agenda } from "agenda";
import { PostgresBackend } from "@agendajs/postgres-backend";
import env from "./env.js";

const connectionString = `postgresql://${env.postgres.username}:${env.postgres.password}@${env.postgres.host}:${env.postgres.port}/${env.postgres.database}?sslmode=no-verify`;

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
      console.log(`🟢 Agenda connected to '${env.postgres.database}'`);
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