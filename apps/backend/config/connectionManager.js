// ==============================================
// BACK-END  ➜  config/connectionManager.js
// ==============================================
const { Client } = require("pg");
require("dotenv").config();

const sessions = new Map();          // sid ➜ { client, lastSeen }
const TTL = 1000 * 60 * 15;          // 15-minute idle timeout

async function createSession(sessionId) {
  if (sessions.has(sessionId)) {
    sessions.get(sessionId).lastSeen = Date.now();
    return sessions.get(sessionId).client;
  }

  const client = new Client({
    host: process.env.DB_HOST ?? "localhost",
    port: process.env.DB_PORT ?? 5432,
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASS ?? "",
    database: process.env.DB_NAME_COMPILER ?? "postgres",
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();
  await client.query("BEGIN");
  sessions.set(sessionId, { client, lastSeen: Date.now() });
  console.log("🎲  BEGIN session", sessionId);
  return client;
}

async function closeSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return;

  await entry.client.query("ROLLBACK");
  await entry.client.end();
  sessions.delete(sessionId);
  console.log("🧹  ROLLBACK & close", sessionId);
}

/* ---- idle sweeper ---- */
setInterval(() => {
  const now = Date.now();
  for (const [sid, { lastSeen }] of sessions) {
    if (now - lastSeen > TTL) closeSession(sid);
  }
}, 60_000);

module.exports = { createSession, closeSession };
