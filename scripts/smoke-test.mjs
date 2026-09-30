// Smoke-test every operation in the gateway's OpenAPI spec.
//
//   node scripts/smoke-test.mjs              # run it (API must be up on :5050)
//   node scripts/smoke-test.mjs --dry        # only count what would be fired/skipped
//
// Sends NO auth token, empty JSON bodies and non-existent IDs, 4 at a time.
// Unauthenticated routes whose path suggests a real-world side effect (sending,
// payments, webhooks, crons, ...) are skipped and listed for manual testing.
//
// Result classes:
//   ok          2xx/3xx
//   client-4xx  400/401/403/404/422... - route is wired up and answering (expected)
//   server-5xx  the route is broken - these are what to fix
//   error       timeout / connection failure
//   skipped     not fired (see reason)
//
// Writes smoke-results.json and prints a summary + every 5xx with its error text.
import fs from "node:fs";

const BASE = process.env.SMOKE_BASE || "http://localhost:5050";
const DRY = process.argv.includes("--dry");
const OUT = "smoke-results.json";
const CONCURRENCY = 4;

const RISKY =
  /webhook|cron|trigger|send|broadcast|notif|bulk|import|sync|campaign|payment|razorpay|cashfree|refund|order|checkout|otp|sms|whatsapp|gallabox|email|mail|invite|unsubscribe|reset|seed|migrat|publish|schedul|enrol|remind|run|execute|dispatch|blast|queue|job|worker|purge|flush|clear|all$/i;

const spec = await (await fetch(`${BASE}/docs/openapi/all.json`)).json();

const ops = [];
for (const [path, item] of Object.entries(spec.paths))
  for (const [method, op] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    const auth = !!op["x-auth-detected"];
    let skip = null;
    if (!auth && RISKY.test(path)) skip = method === "get" ? "unauth GET, side-effect name" : "unauth write, side-effect name";
    ops.push({ method: method.toUpperCase(), path, auth, skip });
  }

// Path params: slug-like names get a string, everything else a numeric ID no row has.
const fill = (p) =>
  p.replace(/\{([^}]+)\}/g, (_, n) =>
    /slug|name|token|code|key|email|type|status|provider|brand/i.test(n) ? "smoke-test-nonexistent" : "999999999",
  );

async function hit(o) {
  if (o.skip) return { ...o, cls: "skipped" };
  const init = { method: o.method, headers: {}, signal: AbortSignal.timeout(15000) };
  if (["POST", "PUT", "PATCH"].includes(o.method)) {
    init.headers["content-type"] = "application/json";
    init.body = "{}";
  }
  const t = Date.now();
  try {
    const r = await fetch(BASE + fill(o.path), init);
    const text = (await r.text()).replace(/\s+/g, " ").slice(0, 220);
    const cls = r.status < 400 ? "ok" : r.status < 500 ? "client-4xx" : "server-5xx";
    return { ...o, status: r.status, cls, ms: Date.now() - t, body: cls === "server-5xx" ? text : undefined };
  } catch (e) {
    return { ...o, cls: "error", error: String(e.cause?.code || e.name || e.message), ms: Date.now() - t };
  }
}

const skipped = ops.filter((o) => o.skip);
console.log(`${ops.length} operations: ${ops.length - skipped.length} to fire, ${skipped.length} skipped`);
if (DRY) {
  for (const o of skipped) console.log(`  skip ${o.method.padEnd(6)} ${o.path}  (${o.skip})`);
  process.exit(0);
}

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < ops.length) results.push(await hit(ops[next++]));
  }),
);
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));

const brandOf = (p) => p.split("/")[1];
const table = {};
for (const r of results) {
  const b = (table[brandOf(r.path)] ??= { ok: 0, "client-4xx": 0, "server-5xx": 0, error: 0, skipped: 0 });
  b[r.cls]++;
}
console.log("\nper brand:");
console.table(table);

const broken = results.filter((r) => r.cls === "server-5xx" || r.cls === "error");
console.log(`\n${broken.length} broken:`);
for (const r of broken.sort((a, b) => a.path.localeCompare(b.path)))
  console.log(`  ${r.status ?? "ERR"} ${r.method.padEnd(6)} ${r.path}\n      ${r.body ?? r.error}`);
console.log(`\nfull results: ${OUT}`);
