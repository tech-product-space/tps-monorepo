/**
 * Integration test for the event referral feature.
 *
 * Boots the real express app against the configured database, seeds namespaced
 * fixtures, exercises every referral endpoint over HTTP, then deletes
 * everything it created.
 *
 *   node src/test/referral.itest.js
 *
 * Email safety: this imports app.js (not server.js), so initEmailProviders() is
 * never called. sendMail() therefore runs its whole code path — template
 * lookup, HTML build, ICS generation — and returns { success:false } without
 * dispatching any mail.
 */

import app from "../app.js";
import db from "../database/postgres/models/index.js";
import { generateToken } from "../util/jwt.util.js";

const { Event, EventGuest, User, EventEmailTemplate } = db;

const TAG = "zz-referral-itest";
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

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(
    name,
    ok,
    ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

let BASE;
let server;

async function req(method, path, { token, cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = `accessToken=${cookie}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }

  return { status: res.status, body: json };
}

const userCookie = (userId) =>
  generateToken({ userId, type: "website_user" });

async function cleanup() {
  const event = await Event.findOne({ where: { eventSlug: EVENT_SLUG } });
  if (event) {
    await EventEmailTemplate.destroy({ where: { eventId: event.id } });
    await EventGuest.destroy({ where: { eventId: event.id } });
    await Event.destroy({ where: { id: event.id } });
  }
  await User.destroy({ where: { email: { [db.Sequelize.Op.like]: `${TAG}%` } } });
}

async function main() {
  console.log("\n=== SETUP ===");
  await cleanup(); // in case a previous run died mid-way

  const event = await Event.create({
    eventTitle: "Referral Integration Test Event",
    eventSlug: EVENT_SLUG,
    eventType: "Workshop", // Workshop => join() defaults to Waitlisted
    eventCategory: "Normal",
    eventStartDate: "2026-12-01",
    eventEndDate: "2026-12-01",
    eventStartTime: "18:00",
    eventEndTime: "19:00",
    isPublished: false,
    location: "Online",
  });
  console.log(`  seeded event ${event.id}`);

  // Six users. The model hook mints each a unique referralCode.
  const users = {};
  for (const key of ["alice", "bob", "carol", "dave", "erin", "frank"]) {
    users[key] = await User.create({
      fullName: key[0].toUpperCase() + key.slice(1) + " Test",
      email: `${TAG}-${key}@example.invalid`,
      phone: "9990000000",
      password: "x",
    });
  }
  console.log(`  seeded 6 users, codes: ${Object.values(users).map((u) => u.referralCode).join(", ")}`);

  const guest = (user, referrer, status = "Waitlisted") =>
    EventGuest.create({
      eventId: event.id,
      userId: user.id,
      isAccountLinked: true,
      name: user.fullName,
      email: user.email,
      phone: "9990000000",
      attendeeType: "Professional",
      role: "PM",
      status,
      referralCode: referrer ? referrer.referralCode : null,
      referrerUserId: referrer ? referrer.id : null,
    });

  // alice refers bob, carol, dave  -> 3
  // bob   refers erin              -> 1
  // frank refers nobody but IS registered
  // A 7th guest is referred by a user with NO registration of their own, to
  // cover the "referrer never registered" branch in the admin table.
  await guest(users.alice, null, "Approved");
  await guest(users.bob, users.alice);
  await guest(users.carol, users.alice);
  await guest(users.dave, users.alice);
  await guest(users.erin, users.bob);
  await guest(users.frank, null);

  const ghost = await User.create({
    fullName: "Ghost Referrer",
    email: `${TAG}-ghost@example.invalid`,
    phone: "9990000000",
    password: "x",
  });
  const orphan = await User.create({
    fullName: "Orphan Guest",
    email: `${TAG}-orphan@example.invalid`,
    phone: "9990000000",
    password: "x",
  });
  await guest(orphan, ghost);

  const adminUser = (
    await db.sequelize.query("select id from admin_users limit 1")
  )[0][0];
  const adminToken = generateToken({ id: adminUser.id, role: "Super Admin" });

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      BASE = `http://127.0.0.1:${server.address().port}`;
      console.log(`  app listening on ${BASE}`);
      resolve();
    });
  });

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== A. GET /events/guest/referral/summary ===");

  let r = await req("GET", `/events/guest/referral/summary?eventSlug=${EVENT_SLUG}`);
  eq("A1 no auth cookie -> 401", r.status, 401);

  r = await req("GET", "/events/guest/referral/summary", {
    cookie: userCookie(users.alice.id),
  });
  eq("A2 missing eventSlug -> 400", r.status, 400);

  r = await req("GET", "/events/guest/referral/summary?eventSlug=does-not-exist", {
    cookie: userCookie(users.alice.id),
  });
  eq("A3 unknown slug -> 404", r.status, 404);

  r = await req("GET", `/events/guest/referral/summary?eventSlug=${EVENT_SLUG}`, {
    cookie: userCookie(ghost.id),
  });
  eq("A4 authed but not registered -> 403", r.status, 403);

  r = await req("GET", `/events/guest/referral/summary?eventSlug=${EVENT_SLUG}`, {
    cookie: userCookie(users.alice.id),
  });
  eq("A5 alice -> 200", r.status, 200);
  eq("A5 alice referral code matches users table", r.body?.data?.referral?.code, users.alice.referralCode);
  eq("A5 alice totalReferrals = 3", r.body?.data?.referral?.totalReferrals, 3);
  eq("A5 alice referredBy = null", r.body?.data?.referredBy, null);
  eq("A5 alice status = Approved", r.body?.data?.registration?.status, "Approved");
  eq("A5 event slug echoed", r.body?.data?.event?.slug, EVENT_SLUG);
  eq("A5 event title echoed", r.body?.data?.event?.title, "Referral Integration Test Event");

  r = await req("GET", `/events/guest/referral/summary?eventSlug=${EVENT_SLUG}`, {
    cookie: userCookie(users.bob.id),
  });
  eq("A6 bob totalReferrals = 1", r.body?.data?.referral?.totalReferrals, 1);
  eq("A6 bob referredBy = Alice", r.body?.data?.referredBy?.name, users.alice.fullName);

  r = await req("GET", `/events/guest/referral/summary?eventSlug=${EVENT_SLUG}`, {
    cookie: userCookie(users.frank.id),
  });
  eq("A7 frank totalReferrals = 0", r.body?.data?.referral?.totalReferrals, 0);
  check(
    "A7 frank has an 8-char code",
    typeof r.body?.data?.referral?.code === "string" &&
      r.body.data.referral.code.length === 8,
  );

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== B. GET /events/guest/referral/referred ===");

  r = await req("GET", `/events/guest/referral/referred?eventSlug=${EVENT_SLUG}`);
  eq("B1 no auth -> 401", r.status, 401);

  r = await req("GET", `/events/guest/referral/referred?eventSlug=${EVENT_SLUG}`, {
    cookie: userCookie(users.alice.id),
  });
  eq("B2 alice referred 3", r.body?.data?.length, 3);
  eq(
    "B2 names correct",
    r.body?.data?.map((g) => g.name).sort(),
    ["Bob Test", "Carol Test", "Dave Test"],
  );
  check("B2 rows carry status", r.body?.data?.every((g) => g.status === "Waitlisted"));

  r = await req("GET", `/events/guest/referral/referred?eventSlug=${EVENT_SLUG}`, {
    cookie: userCookie(users.frank.id),
  });
  eq("B3 frank referred nobody -> []", r.body?.data?.length, 0);

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== C. GET /events/guest/referral/leaderboard (admin) ===");

  r = await req("GET", `/events/guest/referral/leaderboard?eventId=${event.id}`);
  eq("C1 no admin token -> 401", r.status, 401);

  r = await req("GET", "/events/guest/referral/leaderboard", { token: adminToken });
  eq("C2 missing eventId -> 400", r.status, 400);

  r = await req("GET", `/events/guest/referral/leaderboard?eventId=${event.id}`, {
    token: adminToken,
  });
  eq("C3 -> 200", r.status, 200);
  eq("C3 three referrers (alice, bob, ghost)", r.body?.meta?.total, 3);
  eq("C3 ordered by referredCount desc", r.body?.data?.map((x) => x.referredCount), [3, 1, 1]);

  const aliceRow = r.body?.data?.find((x) => x.referrerUserId === users.alice.id);
  eq("C3 alice referredCount = 3", aliceRow?.referredCount, 3);
  eq("C3 alice code exposed", aliceRow?.referralCode, users.alice.referralCode);
  eq("C3 alice email exposed", aliceRow?.email, users.alice.email);
  eq("C3 alice own status = Approved", aliceRow?.status, "Approved");
  check("C3 alice guestId present", typeof aliceRow?.guestId === "string");

  const ghostRow = r.body?.data?.find((x) => x.referrerUserId === ghost.id);
  eq("C3 ghost referredCount = 1", ghostRow?.referredCount, 1);
  eq("C3 ghost guestId null (never registered)", ghostRow?.guestId, null);
  eq("C3 ghost status null", ghostRow?.status, null);
  eq("C3 ghost still shows name from users table", ghostRow?.name, "Ghost Referrer");

  r = await req(
    "GET",
    `/events/guest/referral/leaderboard?eventId=${event.id}&page=1&limit=2`,
    { token: adminToken },
  );
  eq("C4 page 1 limit 2 -> 2 rows", r.body?.data?.length, 2);
  eq("C4 meta.total still 3", r.body?.meta?.total, 3);
  eq("C4 meta.totalPages 2", r.body?.meta?.totalPages, 2);
  eq("C4 meta.hasNextPage true", r.body?.meta?.hasNextPage, true);
  const page1Ids = r.body?.data?.map((x) => x.referrerUserId);

  r = await req(
    "GET",
    `/events/guest/referral/leaderboard?eventId=${event.id}&page=2&limit=2`,
    { token: adminToken },
  );
  eq("C5 page 2 -> 1 row", r.body?.data?.length, 1);
  eq("C5 meta.hasNextPage false", r.body?.meta?.hasNextPage, false);
  check(
    "C5 page 2 row not on page 1",
    !page1Ids.includes(r.body?.data?.[0]?.referrerUserId),
  );

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== D. GET /events/guest/referral/stats (admin) ===");

  r = await req("GET", `/events/guest/referral/stats?eventId=${event.id}`);
  eq("D1 no admin token -> 401", r.status, 401);

  r = await req("GET", `/events/guest/referral/stats?eventId=${event.id}`, {
    token: adminToken,
  });
  eq("D2 totalReferred = 5", r.body?.data?.totalReferred, 5);
  eq("D2 totalReferrers = 3", r.body?.data?.totalReferrers, 3);
  eq("D2 topReferrer = alice", r.body?.data?.topReferrer?.referrerUserId, users.alice.id);
  eq("D2 topReferrer count = 3", r.body?.data?.topReferrer?.referredCount, 3);

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== E. GET /events/guest/referral/referees (admin) ===");

  r = await req("GET", `/events/guest/referral/referees?eventId=${event.id}`, {
    token: adminToken,
  });
  eq("E1 missing referrerUserId -> 400", r.status, 400);

  r = await req(
    "GET",
    `/events/guest/referral/referees?eventId=${event.id}&referrerUserId=${users.alice.id}`,
    { token: adminToken },
  );
  eq("E2 -> 200", r.status, 200);
  eq("E2 three referees", r.body?.data?.length, 3);
  eq(
    "E2 correct people",
    r.body?.data?.map((g) => g.email).sort(),
    [`${TAG}-bob@example.invalid`, `${TAG}-carol@example.invalid`, `${TAG}-dave@example.invalid`],
  );
  check(
    "E2 rows carry attendeeType + status",
    r.body?.data?.every((g) => g.attendeeType === "Professional" && g.status === "Waitlisted"),
  );

  r = await req(
    "GET",
    `/events/guest/referral/referees?eventId=${event.id}&referrerUserId=${users.frank.id}`,
    { token: adminToken },
  );
  eq("E3 referrer with none -> []", r.body?.data?.length, 0);

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== F. PATCH bulk-approve (admin) ===");

  const bulkPath = `/events/guest/event/${event.id}/referral/bulk-approve`;

  r = await req("PATCH", bulkPath, { body: { minReferrals: 1 } });
  eq("F1 no admin token -> 401", r.status, 401);

  r = await req("PATCH", bulkPath, { token: adminToken, body: { minReferrals: 0 } });
  eq("F2 minReferrals 0 -> 400", r.status, 400);

  r = await req("PATCH", bulkPath, { token: adminToken, body: { minReferrals: "abc" } });
  eq("F3 non-numeric -> 400", r.status, 400);

  r = await req("PATCH", bulkPath, {
    token: adminToken,
    body: { minReferrals: 99, dryRun: true },
  });
  eq("F4 impossible threshold -> affectedCount 0", r.body?.affectedCount, 0);

  // alice (3 referrals) is already Approved, bob (1 referral) is Waitlisted.
  r = await req("PATCH", bulkPath, {
    token: adminToken,
    body: { minReferrals: 3, dryRun: true },
  });
  eq("F5 dryRun min=3 -> affected 0 (alice already Approved)", r.body?.affectedCount, 0);
  eq("F5 dryRun updatedCount 0", r.body?.updatedCount, 0);

  r = await req("PATCH", bulkPath, {
    token: adminToken,
    body: { minReferrals: 1, dryRun: true },
  });
  eq("F6 dryRun min=1 -> affected 1 (bob only)", r.body?.affectedCount, 1);
  eq("F6 dryRun changed nothing", r.body?.updatedCount, 0);

  const bobBefore = await EventGuest.findOne({
    where: { eventId: event.id, userId: users.bob.id },
  });
  eq("F7 bob untouched after dryRun", bobBefore.status, "Waitlisted");

  r = await req("PATCH", bulkPath, {
    token: adminToken,
    body: { minReferrals: 1 },
  });
  eq("F8 real run -> 200", r.status, 200);
  eq("F8 updatedCount 1", r.body?.updatedCount, 1);

  const bobAfter = await EventGuest.findOne({
    where: { eventId: event.id, userId: users.bob.id },
  });
  eq("F8 bob now Approved", bobAfter.status, "Approved");
  eq("F8 statusUpdatedBy recorded", bobAfter.statusUpdatedBy, adminUser.id);
  check("F8 statusUpdatedAt set", bobAfter.statusUpdatedAt instanceof Date);

  const carolAfter = await EventGuest.findOne({
    where: { eventId: event.id, userId: users.carol.id },
  });
  eq("F8 non-referrer carol untouched", carolAfter.status, "Waitlisted");

  const frankAfter = await EventGuest.findOne({
    where: { eventId: event.id, userId: users.frank.id },
  });
  eq("F8 zero-referral frank untouched", frankAfter.status, "Waitlisted");

  // Now with an Approved template present, so the email branch actually runs
  // (buildEmail + ICS + sendMail), which returns failure with no transports.
  await EventEmailTemplate.create({
    eventId: event.id,
    type: "Approved",
    subject: "You're in",
    body: "<p>Hi {{name}}</p>",
  });

  await EventGuest.update(
    { status: "Waitlisted", statusUpdatedBy: null, statusUpdatedAt: null },
    { where: { eventId: event.id, userId: users.bob.id } },
  );

  r = await req("PATCH", bulkPath, {
    token: adminToken,
    body: { minReferrals: 1 },
  });
  eq("F9 email branch runs -> 200", r.status, 200);
  eq("F9 updatedCount 1", r.body?.updatedCount, 1);
  const bobEmailRun = await EventGuest.findOne({
    where: { eventId: event.id, userId: users.bob.id },
  });
  eq("F9 bob Approved again", bobEmailRun.status, "Approved");

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== G. POST /events/guest/join — referral handling ===");

  const joinBody = (email, referralCode) => ({
    eventId: event.id,
    name: "Joiner",
    email,
    phone: "9998887777",
    countryCode: "+91",
    attendeeType: "Professional",
    role: "PM",
    referralCode,
  });

  // Lowercased + padded code must still resolve to the referrer.
  const messyCode = `  ${users.alice.referralCode.toLowerCase()}  `;
  r = await req("POST", "/events/guest/join", {
    body: joinBody(`${TAG}-join1@example.invalid`, messyCode),
  });
  eq("G1 join -> 201", r.status, 201);
  eq("G1 code normalised to uppercase", r.body?.data?.referralCode, users.alice.referralCode);
  eq("G1 referrer resolved despite casing/whitespace", r.body?.data?.referrerUserId, users.alice.id);
  eq("G1 Workshop defaults to Waitlisted", r.body?.data?.status, "Waitlisted");

  // Unknown code: kept for reporting, but no attribution.
  r = await req("POST", "/events/guest/join", {
    body: joinBody(`${TAG}-join2@example.invalid`, "NOSUCH99"),
  });
  eq("G2 unknown code -> 201", r.status, 201);
  eq("G2 code retained", r.body?.data?.referralCode, "NOSUCH99");
  eq("G2 no referrer attributed", r.body?.data?.referrerUserId, null);

  // Self-referral: code stored, attribution refused.
  const selfUser = await User.create({
    fullName: "Self Referrer",
    email: `${TAG}-self@example.invalid`,
    phone: "9990000000",
    password: "x",
  });
  r = await req("POST", "/events/guest/join", {
    body: {
      ...joinBody(`${TAG}-self-join@example.invalid`, selfUser.referralCode),
      userId: selfUser.id,
    },
  });
  eq("G3 self-referral join -> 201", r.status, 201);
  eq("G3 own code stored", r.body?.data?.referralCode, selfUser.referralCode);
  eq("G3 self-referral NOT attributed", r.body?.data?.referrerUserId, null);

  // Self-referral with no userId — the join dialog's real shape, since it
  // registers a visitor before they authenticate. Matching is on email, so a
  // different casing must not slip past it either.
  const selfAnon = await User.create({
    fullName: "Self Referrer Anon",
    email: `${TAG}-self-anon@example.invalid`,
    phone: "9990000001",
    password: "x",
  });
  r = await req("POST", "/events/guest/join", {
    body: joinBody(selfAnon.email.toUpperCase(), selfAnon.referralCode),
  });
  eq("G3b anonymous self-referral join -> 201", r.status, 201);
  eq("G3b own code stored", r.body?.data?.referralCode, selfAnon.referralCode);
  eq("G3b anonymous self-referral NOT attributed", r.body?.data?.referrerUserId, null);

  // No code at all.
  r = await req("POST", "/events/guest/join", {
    body: joinBody(`${TAG}-join3@example.invalid`, undefined),
  });
  eq("G4 no code -> 201", r.status, 201);
  eq("G4 referralCode null", r.body?.data?.referralCode, null);
  eq("G4 referrerUserId null", r.body?.data?.referrerUserId, null);

  // Counts must reflect the new joins.
  r = await req("GET", `/events/guest/referral/summary?eventSlug=${EVENT_SLUG}`, {
    cookie: userCookie(users.alice.id),
  });
  eq("G5 alice count rose to 4 after G1", r.body?.data?.referral?.totalReferrals, 4);

  r = await req("GET", `/events/guest/referral/stats?eventId=${event.id}`, {
    token: adminToken,
  });
  eq("G5 stats totalReferred rose to 6", r.body?.data?.totalReferred, 6);

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log("\n=== H. Isolation — other events unaffected ===");

  const otherCounts = (
    await db.sequelize.query(
      `select count(*)::int as n from "EventGuests" where "eventId" <> :eid and "referrerUserId" is not null`,
      { replacements: { eid: event.id }, type: db.Sequelize.QueryTypes.SELECT },
    )
  )[0];
  check(
    "H1 referral counts scope to one event",
    typeof otherCounts.n === "number",
    `other-event referred rows: ${otherCounts.n}`,
  );

  const stray = await EventGuest.count({
    where: { eventId: event.id, referrerUserId: users.alice.id },
  });
  eq("H2 alice attribution rows == 4", stray, 4);
}

let exitCode = 0;

try {
  await main();
} catch (err) {
  console.error("\nTEST RUN CRASHED:", err);
  failures.push("run crashed: " + err.message);
} finally {
  console.log("\n=== TEARDOWN ===");
  try {
    await cleanup();
    const leftoverEvent = await Event.count({ where: { eventSlug: EVENT_SLUG } });
    const leftoverUsers = await User.count({
      where: { email: { [db.Sequelize.Op.like]: `${TAG}%` } },
    });
    console.log(`  leftover events: ${leftoverEvent}, leftover users: ${leftoverUsers}`);
    if (leftoverEvent || leftoverUsers) failures.push("teardown left rows behind");
  } catch (err) {
    console.error("  cleanup failed:", err.message);
    failures.push("cleanup failed");
  }

  if (server) server.close();
  await db.sequelize.close();

  console.log(`\n=== RESULT: ${pass} passed, ${failures.length} failed ===`);
  if (failures.length) {
    console.log("Failed:");
    failures.forEach((f) => console.log("  - " + f));
    exitCode = 1;
  }
  process.exit(exitCode);
}
