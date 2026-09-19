const psEnv = require("@ps/env/tps");
const Agenda = require("agenda");
const { sendAdminAlert } = require("../service/mail/mailservice");

const isDev = psEnv.NODE_ENV === "development";
const collection = isDev ? "agendaJobs_dev" : "agendaJobs";

const agenda = new Agenda({
  db: {
    address: psEnv.MONGO_DB_URL,
    collection,
  },
});

// Agenda opens its own Mongo connection at require time. Without a listener, a
// failed connection (Mongo down/unset) is an unhandled 'error' event and kills the
// whole process — which, now that one process serves every brand, would take the
// CRM and Gradient down with TPS. Log it; scheduling just fails until Mongo is back.
agenda.on("error", (err) => {
  console.error("[agenda] MongoDB error:", err && err.message ? err.message : err);
});

if (psEnv.SCHEDULED_JOBS_ENABLED === "true") {
  agenda.on("ready", async () => {
    console.log("✅ Agenda v5 connected to MongoDB!");
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
