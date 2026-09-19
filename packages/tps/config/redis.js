"use strict";

const psEnv = require("@ps/env/tps");
const IORedis = require("ioredis");

const REDIS_HOST = psEnv.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(psEnv.REDIS_PORT || "6379", 10);
const REDIS_PASSWORD = psEnv.REDIS_PASSWORD || undefined;

function createRedisConnection() {
  return new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    // Required by BullMQ — workers block on commands and need infinite retries
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

// Shared client for app-level Redis usage (frequency caps, etc.)
// BullMQ workers/queues need their own connections (maxRetriesPerRequest: null);
// general app code should use this singleton.
let _sharedClient = null;
function getSharedRedis() {
  if (!_sharedClient) {
    _sharedClient = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      lazyConnect: false,
    });
    _sharedClient.on("error", (err) => {
      console.error("[redis-shared] error:", err.message);
    });
  }
  return _sharedClient;
}

module.exports = {
  createRedisConnection,
  getSharedRedis,
  REDIS_HOST,
  REDIS_PORT,
};
