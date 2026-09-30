const Agenda = require("agenda");
const { sendAdminAlert } = require("../service/mail/mailservice");

const isDev = process.env.NODE_ENV === "development";
const collection = isDev ? "agendaJobs_dev" : "agendaJobs";

const agenda = new Agenda({
  db: {
    address: process.env.MONGO_DB_URL,
    collection,
  },
});

if (process.env.SCHEDULED_JOBS_ENABLED === "true") {
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
