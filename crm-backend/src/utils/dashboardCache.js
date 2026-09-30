/**
 * Lightweight in-memory TTL cache for dashboard responses.
 * Keyed by (role, user_id, endpoint, filters_hash).
 *
 * Replace with Redis when scale demands it; the interface (get/set) stays the same.
 */
const crypto = require('crypto');

const TTL_MS = 60 * 1000;
const MAX_ENTRIES = 1000;
const store = new Map();

function makeKey({ role, user_id, endpoint, filters }) {
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify(filters || {}))
    .digest('hex')
    .slice(0, 12);
  return `${role}:${user_id}:${endpoint}:${hash}`;
}

function get(keyParts) {
  const key = makeKey(keyParts);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expires_at < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(keyParts, value, ttl_ms = TTL_MS) {
  const key = makeKey(keyParts);
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { value, expires_at: Date.now() + ttl_ms });
}

function clear() {
  store.clear();
}

module.exports = { get, set, clear, makeKey };
