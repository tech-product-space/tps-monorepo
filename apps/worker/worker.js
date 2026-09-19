require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const { startWorkers } = require("./start");

async function main() {
  const stop = await startWorkers();

  // Let in-flight jobs finish rather than killing them: an interrupted send is
  // what turns a routine deploy into a duplicate email.
  const shutdown = async (signal) => {
    console.log(`[worker] ${signal}: shutting down`);
    try {
      await stop();
    } catch (err) {
      console.error("[worker] error during shutdown:", err.message);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});
