const { Agenda } = require("agenda");
const { PostgresBackend } = require("@agendajs/postgres-backend");
const { sendAdminAlert } = require("../service/mail/mailservice");

// Scheduled jobs live in Postgres (schema from DB_SCHEMA, default "tps"), not
// MongoDB. Agenda v6 and its Postgres backend are ESM-only; Node >= 22.12 can
// require() them from this CommonJS file.
//
// Development gets its own table, as it had its own Mongo collection: local
// dev connects to the same database (via SSH tunnel) and must not pick up
// production jobs.
const isDev = process.env.NODE_ENV === "development";
const schema = process.env.DB_SCHEMA || "tps";

const agenda = new Agenda({
  backend: new PostgresBackend({
    poolConfig: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      options: `-c search_path=${schema}`,
      ...(process.env.DB_SSL === "true" ? { ssl: { rejectUnauthorized: false } } : {}),
    },
    tableName: isDev ? "agenda_jobs_dev" : "agenda_jobs",
    logTableName: isDev ? "agenda_logs_dev" : "agenda_logs",
  }),
});

if (process.env.SCHEDULED_JOBS_ENABLED === "true") {
  agenda.on("ready", async () => {
    console.log(`✅ Agenda v6 connected to Postgres (schema ${schema})`);
    (async () => {
      await agenda.start();
      console.log("🟢 Agenda Started");
    })();
  });

  agenda.on("error", (err) => {
    console.error("❌ Agenda error:", err);
  });

  agenda.on("fail", async (err, job) => {
    if (job.attrs.failCount >= 3) {
      console.error("🚨 Job permanently failed:", job.attrs.name);

      await sendAdminAlert(
        `Agenda Job Failed: ${job.attrs.name}`,
        `
        Job Name: ${job.attrs.name}
        Fail Count: ${job.attrs.failCount}
        Data: ${JSON.stringify(job.attrs.data)}
        Reason: ${err.message}
      `,
      );
    }
  });
} else {
  console.log("🔴 Scheduled Jobs Disabled by ENV");
}

module.exports = agenda;
