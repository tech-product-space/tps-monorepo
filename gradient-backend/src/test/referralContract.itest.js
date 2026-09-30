/**
 * Shape contract: the JSON the referral endpoints actually return must match
 * the TypeScript interfaces the admin panel declares for them.
 *
 * Both sides compile independently, so a rename on one side (referredCount vs
 * referralCount) type-checks everywhere and only breaks at runtime. This reads
 * the real interfaces out of gradient-admin/types/event.ts and diffs them
 * against live responses.
 *
 *   node src/test/referralContract.itest.js
 */

import fs from "fs";
import path from "path";

import app from "../app.js";
import db from "../database/postgres/models/index.js";
import { generateToken } from "../util/jwt.util.js";

const { Event, EventGuest, User } = db;

const ADMIN_TYPES = path.resolve(
  process.cwd(),
  "../gradient-admin/types/event.ts",
);

const TAG = "zz-referral-contract";
const EVENT_SLUG = `${TAG}-event`;

let pass = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

/** Pull the field names out of `export interface Name { ... }`. */
function interfaceFields(source, name) {
  const start = source.indexOf(`export interface ${name} {`);
  if (start === -1) throw new Error(`interface ${name} not found`);

  let depth = 0;
  let i = source.indexOf("{", start);
  const open = i;

  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }

  const body = source.slice(open + 1, i);

  // Only top-level members: strip nested object literals first.
  let flat = "";
  depth = 0;
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) flat += ch;
    if (depth === 0 && (ch === "{" || ch === "}")) flat += " ";
  }

  return flat
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
    .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/))
    .filter(Boolean)
    .map((m) => m[1]);
}

function compareShape(label, declared, actual) {
  const actualKeys = Object.keys(actual);
  const missing = declared.filter((f) => !actualKeys.includes(f));
  const extra = actualKeys.filter((f) => !declared.includes(f));

  check(
    `${label}: server returns every declared field`,
    missing.length === 0,
    missing.length ? `missing from response: ${missing.join(", ")}` : "",
  );
  check(
    `${label}: server returns no undeclared field`,
    extra.length === 0,
    extra.length ? `not in interface: ${extra.join(", ")}` : "",
  );
}

async function cleanup() {
  const event = await Event.findOne({ where: { eventSlug: EVENT_SLUG } });
  if (event) {
    await EventGuest.destroy({ where: { eventId: event.id } });
    await Event.destroy({ where: { id: event.id } });
  }
  await User.destroy({ where: { email: { [db.Sequelize.Op.like]: `${TAG}%` } } });
}

let server;

try {
  await cleanup();

  const source = fs.readFileSync(ADMIN_TYPES, "utf8");

  const event = await Event.create({
    eventTitle: "Referral Contract Test",
    eventSlug: EVENT_SLUG,
    eventType: "Workshop",
    eventCategory: "Normal",
    eventStartDate: "2026-12-01",
    eventEndDate: "2026-12-01",
    isPublished: false,
  });

  const referrer = await User.create({
    fullName: "Contract Referrer",
    email: `${TAG}-ref@example.invalid`,
    phone: "9990000000",
    password: "x",
  });
  const referee = await User.create({
    fullName: "Contract Referee",
    email: `${TAG}-ree@example.invalid`,
    phone: "9990000000",
    password: "x",
  });

  const mk = (user, ref) =>
    EventGuest.create({
      eventId: event.id,
      userId: user.id,
      isAccountLinked: true,
      name: user.fullName,
      email: user.email,
      phone: "9990000000",
      attendeeType: "Professional",
      role: "PM",
      status: "Waitlisted",
      referralCode: ref ? ref.referralCode : null,
      referrerUserId: ref ? ref.id : null,
    });

  await mk(referrer, null);
  await mk(referee, referrer);

  const admin = (await db.sequelize.query("select id from admin_users limit 1"))[0][0];
  const token = generateToken({ id: admin.id });

  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const BASE = `http://127.0.0.1:${server.address().port}`;

  const get = async (p) => {
    const res = await fetch(`${BASE}${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json() };
  };

  console.log("\n=== Server JSON vs gradient-admin/types/event.ts ===\n");

  // ReferralLeaderboardRow
  const lb = await get(`/events/guest/referral/leaderboard?eventId=${event.id}`);
  check("leaderboard responded 200", lb.status === 200, `got ${lb.status}`);
  check("leaderboard returned a row to inspect", lb.body?.data?.length > 0);
  compareShape(
    "ReferralLeaderboardRow",
    interfaceFields(source, "ReferralLeaderboardRow"),
    lb.body.data[0],
  );

  // ReferralLeaderboardResponse (top-level envelope)
  compareShape(
    "ReferralLeaderboardResponse",
    interfaceFields(source, "ReferralLeaderboardResponse"),
    lb.body,
  );

  // IPaginationMeta is what the shared Pagination component consumes.
  const metaKeys = Object.keys(lb.body.meta).sort();
  check(
    "meta matches IPaginationMeta",
    JSON.stringify(metaKeys) ===
      JSON.stringify(
        ["hasNextPage", "hasPrevPage", "limit", "page", "total", "totalPages"],
      ),
    `got ${metaKeys.join(", ")}`,
  );

  // ReferralStats
  const stats = await get(`/events/guest/referral/stats?eventId=${event.id}`);
  compareShape(
    "ReferralStats",
    interfaceFields(source, "ReferralStats"),
    stats.body.data,
  );
  check(
    "ReferralStats.topReferrer shape",
    stats.body.data.topReferrer &&
      ["referrerUserId", "name", "email", "referredCount"].every(
        (k) => k in stats.body.data.topReferrer,
      ),
    JSON.stringify(stats.body.data.topReferrer),
  );

  // ReferredGuest
  const referees = await get(
    `/events/guest/referral/referees?eventId=${event.id}&referrerUserId=${referrer.id}`,
  );
  check("referees returned a row to inspect", referees.body?.data?.length > 0);
  compareShape(
    "ReferredGuest",
    interfaceFields(source, "ReferredGuest"),
    referees.body.data[0],
  );

  // The CSV exporter paginates on meta.hasNextPage — verify the leaderboard
  // satisfies the contract DownloadCsvButtonEvent depends on.
  check(
    "leaderboard is CSV-exporter compatible (data[] + meta.hasNextPage)",
    Array.isArray(lb.body.data) && typeof lb.body.meta.hasNextPage === "boolean",
  );
} catch (err) {
  console.error("\nCRASHED:", err);
  failures.push("crashed: " + err.message);
} finally {
  await cleanup();
  if (server) server.close();
  await db.sequelize.close();

  console.log(`\n=== RESULT: ${pass} passed, ${failures.length} failed ===`);
  failures.forEach((f) => console.log("  - " + f));
  process.exit(failures.length ? 1 : 0);
}
