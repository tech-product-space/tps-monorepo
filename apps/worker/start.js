const { enabledBrands } = require("../api/lib/brands");

/**
 * Everything that must run exactly once per deployment — as opposed to once per
 * API instance. Run this in one process (apps/worker/worker.js), and keep the API
 * from starting any of it (RUN_WORKERS_IN_API unset), or crons fire twice.
 *
 * The per-brand *_CRON_ENABLED / WORKFLOWS_ENABLED / AGENDA_JOBS_ENABLED flags
 * inside each package still apply; this only decides which brands are started.
 */
const STARTERS = {
  // tps-next-backend used to start all of this from server.js on import, except
  // the workflow worker, which was its own PM2 process.
  async tps() {
    const { sequelize } = require("@ps/tps/models");
    await sequelize.authenticate();
    require("@ps/tps/cron"); // 91leads, airtable, meta, expenses, crm visit sync, activity sweep/prune
    require("@ps/tps/jobs"); // Agenda: publish-blog, send-campaign, event email, support notify
    require("@ps/tps/workers/workflowWorker"); // BullMQ workflow + activity sync (self-starting)
  },

  // gradient-backend: initAgendaJobs() ran in the API process and src/worker.js
  // was the separate BullMQ process. Both live here now.
  async gradient() {
    const { initServices } = await import("@ps/gradient/src/boot.js");
    await initServices({ agenda: true });
    const { startWorkflowWorkers, stopWorkflowWorkers } = await import("@ps/gradient/src/workers/workflowWorker.js");
    const { started } = startWorkflowWorkers();
    if (!started) console.warn("[worker] gradient: workflow workers not started (WORKFLOWS_ENABLED / REDIS_URL?)");
    return { stop: stopWorkflowWorkers };
  },

  // tps-crm-backend: five cron modules that registered themselves on require.
  async crm() {
    const { sequelize } = require("@ps/crm/src/models");
    await sequelize.authenticate();
    require("@ps/crm/src/cron");
  },
};

async function startWorkers(brands = enabledBrands()) {
  const stoppers = [];
  for (const name of brands) {
    const handle = await STARTERS[name]();
    if (handle && handle.stop) stoppers.push(handle.stop);
    console.log(`[worker] ${name}: started`);
  }
  return async function stop() {
    for (const s of stoppers) await s();
  };
}

module.exports = { startWorkers };
