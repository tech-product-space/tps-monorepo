"use strict";

const psEnv = require("@ps/env/tps");
const { getSharedRedis } = require("../../config/redis");
const { VisitorActivity } = require("../../models");
const { enqueueCrmSync } = require("../../queues/activityQueues");
const { BUFFER_KEY } = require("./buffer");

/**
 * Moves buffered page views out of Redis and into Postgres, in blocks.
 *
 * The order of the three Redis operations is the entire design:
 *
 *     LRANGE   read the block, WITHOUT removing it
 *     INSERT   write it to Postgres
 *     LTRIM    only now remove it from Redis
 *
 * Never pop-then-insert. If this process dies between the two — a deploy, an
 * OOM, a lost database connection — a pop has already destroyed the only copy.
 * Reading first means a crash costs nothing: the rows are still in Redis, the
 * next run picks them up, and the insert discards what it already wrote because
 * the ids were generated upstream. At-least-once delivery onto an idempotent
 * write, which is as close to exactly-once as this needs to be.
 *
 * A lock wraps the whole thing. LRANGE + LTRIM is not safe if two drainers run
 * at once — both could read the same block and the second LTRIM would discard
 * rows the first had not written. Today only the worker process drains, so the
 * lock is insurance against someone scaling it later and losing history in a way
 * that would be very hard to notice.
 */

const LOCK_KEY = "activity:drain:lock";
// Comfortably longer than a batch takes, short enough that a crashed drainer
// does not block the next one for long.
const LOCK_TTL_MS = 30_000;
const BATCH_SIZE = 500;
const INTERVAL_MS = parseInt(psEnv.ACTIVITY_DRAIN_INTERVAL_MS || "1000", 10);

let running = false;
let timer = null;

/**
 * @returns {Promise<{drained:number, inserted:number}>}
 */
async function drainOnce() {
  const redis = getSharedRedis();

  const lock = await redis.set(LOCK_KEY, process.pid, "PX", LOCK_TTL_MS, "NX");
  if (lock !== "OK") return { drained: 0, inserted: 0 };

  try {
    const raw = await redis.lrange(BUFFER_KEY, 0, BATCH_SIZE - 1);
    if (!raw.length) return { drained: 0, inserted: 0 };

    const rows = [];
    for (const item of raw) {
      try {
        rows.push(JSON.parse(item));
      } catch (err) {
        // A single unparseable entry must not wedge the queue forever. It is
        // dropped with the block it arrived in.
        console.error("[activity] discarding unreadable buffer entry:", err.message);
      }
    }

    if (rows.length) {
      await VisitorActivity.bulkCreate(rows, { ignoreDuplicates: true });
      await enqueueCrmSync(rows.map((r) => r.id));
    }

    // Written. Safe to forget.
    await redis.ltrim(BUFFER_KEY, raw.length, -1);

    return { drained: raw.length, inserted: rows.length };
  } finally {
    // Release only our own lock — a slow batch could have let the TTL expire and
    // another drainer take it, and deleting theirs would let a third in.
    const holder = await redis.get(LOCK_KEY);
    if (String(holder) === String(process.pid)) await redis.del(LOCK_KEY);
  }
}

/** Loops drainOnce, skipping a tick if the previous one is still going. */
function startDrainer() {
  if (timer) return;

  console.log(`🟢 Visitor activity drainer started (every ${INTERVAL_MS}ms)`);

  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { drained } = await drainOnce();
      if (drained) console.log(`[activity] drained ${drained}`);
    } catch (err) {
      // Nothing was trimmed, so the rows are still queued for the next tick.
      console.error("[activity] drain failed:", err.message);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);

  timer.unref?.();
}

function stopDrainer() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { drainOnce, startDrainer, stopDrainer, BATCH_SIZE, LOCK_KEY };
