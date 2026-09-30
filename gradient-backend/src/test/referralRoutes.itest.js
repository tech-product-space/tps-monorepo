/**
 * Contract check: every referral URL the admin panel builds must resolve to a
 * real route on the express app with the right method.
 *
 * A wrong path would otherwise surface as a 404 only at runtime, since nothing
 * type-checks the string in services/eventService.ts against the router.
 *
 *   node src/test/referralRoutes.itest.js
 */

import app from "../app.js";

// Mirrors the URLs built in gradient-admin/services/eventService.ts and
// gradient-next-ui's referral service. Kept literal on purpose — this is the
// contract, not a derivation of it.
const CONTRACT = [
  // admin panel
  { method: "GET", path: "/events/guest/referral/leaderboard", who: "admin" },
  { method: "GET", path: "/events/guest/referral/stats", who: "admin" },
  { method: "GET", path: "/events/guest/referral/referees", who: "admin" },
  { method: "PATCH", path: "/events/guest/event/EVT123/referral/bulk-approve", who: "admin" },
  // website user
  { method: "GET", path: "/events/guest/referral/summary", who: "user" },
  { method: "GET", path: "/events/guest/referral/referred", who: "user" },
  // pre-existing routes that must not have been shadowed by the new ones
  { method: "PATCH", path: "/events/guest/GUEST123/status", who: "admin" },
  { method: "PATCH", path: "/events/guest/event/EVT123/status/bulk", who: "admin" },
  { method: "GET", path: "/events/guest/event/EVT123/guest-status", who: "admin" },
  { method: "GET", path: "/events/guest", who: "admin" },
  { method: "GET", path: "/events/guest/check-joined", who: "public" },
  { method: "POST", path: "/events/guest/join", who: "public" },
];

let pass = 0;
const failures = [];

const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const BASE = `http://127.0.0.1:${server.address().port}`;

console.log("\n=== Admin/UI URL -> express route contract ===\n");

for (const { method, path, who } of CONTRACT) {
  // No credentials attached. A route that exists answers 400/401/403 (its own
  // guards); a route that does not exist falls through to notFoundMiddleware.
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" || method === "PATCH" ? "{}" : undefined,
  });

  const exists = res.status !== 404;

  // Guarded routes must reject anonymous callers rather than run.
  const guarded = who === "public" || res.status === 401 || res.status === 403;

  if (exists && guarded) {
    pass++;
    console.log(`  ok    ${method.padEnd(5)} ${path.padEnd(52)} -> ${res.status}`);
  } else {
    failures.push(`${method} ${path}`);
    console.log(
      `  FAIL  ${method.padEnd(5)} ${path.padEnd(52)} -> ${res.status}` +
        (exists ? "  (route exists but did not reject anonymous caller)" : "  (404 — route missing)"),
    );
  }
}

server.close();

console.log(`\n=== RESULT: ${pass} passed, ${failures.length} failed ===`);
if (failures.length) {
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
process.exit(0);
