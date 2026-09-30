import { Agenda } from "agenda";
import { PostgresBackend } from "@agendajs/postgres-backend";
import env from "./env.js";

// ps-v3: @agendajs/postgres-backend has no schema option (only tableName/
// logTableName, always unqualified) — it defaults to whatever schema is first
// in search_path, same as Sequelize's unqualified queryInterface calls. Set it
// via the connection string's `options` param so agenda_jobs/agenda_logs land
// in "gradient" instead of "public".
const schema = process.env.DB_SCHEMA || "gradient";
const connectionString = `postgresql://${env.postgres.username}:${env.postgres.password}@${env.postgres.host}:${env.postgres.port}/${env.postgres.database}?sslmode=no-verify&options=-c%20search_path%3D${schema}`;

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