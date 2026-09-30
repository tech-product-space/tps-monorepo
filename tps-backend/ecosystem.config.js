/**
 * PM2 process file for running the API server and the workflow worker
 * side-by-side. Use:
 *   pm2 start ecosystem.config.js
 *   pm2 status
 *   pm2 logs workflow-worker
 *   pm2 stop ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: "api",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "workflow-worker",
      script: "workers/workflowWorker.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        WORKER_CONCURRENCY: "10",
      },
    },
  ],
};
