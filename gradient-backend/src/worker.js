import env from "./config/env.js";
import { connectDatabases } from "./database/index.js";
import { initEmailProviders } from "./services/email/emailManager.js";
import {
  startWorkflowWorkers,
  stopWorkflowWorkers,
} from "./workers/workflowWorker.js";
import logger from "./util/logger.js";

/**
 * The workflow worker process.
 *
 * A sibling of `server.js`, and deliberately **not** an Express app: it mounts
 * no routers and listens on no port. The API enqueues; this consumes.
 *
 *   npm run worker        production
 *   npm run worker:dev    nodemon
 *
 * **The feature does not work until this is deployed as its own service.** An
 * API running alone will accept a publish, show the workflow as active, enqueue
 * jobs, and run none of them — which looks exactly like a bad trigger filter.
 * `GET /workflows/admin/health` and the panel's banner exist to make that state
 * visible rather than mysterious.
 */

async function start() {
  await connectDatabases();

  // Needed here as well as in the API: this process is the one that actually
  // sends, and `sendMail` resolves `{ success: false }` rather than throwing,
  // so an unregistered provider would look like every recipient failing.
  initEmailProviders();

  const { started } = startWorkflowWorkers();

  if (!started) {
    logger.warn(
      "Worker process is up but consuming nothing. Set WORKFLOWS_ENABLED=true " +
        "and give it a REDIS_URL.",
    );
  }

  logger.info("Workflow worker process ready", {
    environment: env.APP_ENVIRONMENT,
    queuePrefix: env.workflows.queuePrefix,
  });
}

/**
 * Graceful shutdown.
 *
 * The workers are closed rather than killed, so a job that is mid-send finishes
 * instead of being redelivered later — an interrupted send is the one thing
 * that turns a routine deploy into a duplicate email.
 */
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting the workflow worker down`);

  try {
    await stopWorkflowWorkers();
  } catch (error) {
    logger.error("Error during worker shutdown", { error: error.message });
  }

  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((error) => {
  logger.error("Workflow worker failed to start", { error: error.message });
  process.exit(1);
});
