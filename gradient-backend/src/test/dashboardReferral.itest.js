/**
 * Integration test for the dashboard Referrals tab.
 *
 *   node src/test/dashboardReferral.itest.js
 *
 * The tab calls exactly one endpoint — GET /events/guest/referral/mine — and
 * renders three things from it: the code, the total, and a per-event card with
 * `total` / `approved`. This walks the whole loop the tab depends on:
 *
 *   register with a code over HTTP  →  attribution  →  what /mine returns
 *
 * so a break anywhere between the join form and the card shows up here rather
 * than as a permanent zero on someone's dashboard.
 *
 * Boots app.js (not server.js), so no mail is dispatched. Every row it creates
 * is namespaced and deleted at the end.
 */

import app from "../app.js";
import db from "../database/postgres/models/index.js";
import { generateToken } from "../util/jwt.util.js";

const { Event, EventGuest, User, EventEmailTemplate } = db;

const TAG = "zz-dashref-itest";
const EVENT_A = `${TAG}-event-a`;
const EVENT_B = `${TAG}-event-b`;

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

async function req(method, path, { cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
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

const userCookie = (userId) => generateToken({ userId, type: "website_user" });

async function cleanup() {
  for (const slug of [EVENT_A, EVENT_B]) {
    const event = await Event.findOne({ where: { eventSlug: slug } });
    if (!event) continue;
    await EventEmailTemplate.destroy({ where: { eventId: event.id } });
    await EventGuest.destroy({ where: { eventId: event.id } });
    await Event.destroy({ where: { id: event.id } });
  }
  await User.destroy({
    where: { email: { [db.Sequelize.Op.like]: `${TAG}%` } },
  });
}

const mkUser = (key) =>
  User.create({
    fullName: key[0].toUpperCase() + key.slice(1) + " Dashref",
    email: `${TAG}-${key}@example.invalid`,
    phone: "9990000000",
    password: "x",
  });

/** The payload EventJoinDialog builds, minus whatever the caller overrides. */
const joinBody = (event, who, extra = {}) => ({
  eventId: event.id,
  name: who.fullName,
  email: who.email,
  phone: "9990000000",
  countryCode: "+91",
  attendeeType: "Professional",
  role: "PM",
  linkedinUrl: "https://linkedin.com/in/test",
  ...extra,
});

async function main() {
  console.log("\n=== SETUP ===");
  await cleanup();

  const mkEvent = (slug, title) =>
    Event.create({
      eventTitle: title,
      eventSlug: slug,
      eventType: "Workshop", // => join() defaults new guests to Waitlisted
      eventCategory: "Normal",
      eventStartDate: "2026-12-01",
      eventEndDate: "2026-12-01",
      eventStartTime: "18:00",
      eventEndTime: "19:00",
      isPublished: false,
      location: "Online",
    });

  const eventA = await mkEvent(EVENT_A, "Dashboard Referral Test A");
  const eventB = await mkEvent(EVENT_B, "Dashboard Referral Test B");
  console.log(`  seeded events ${eventA.id} / ${eventB.id}`);

  const alice = await mkUser("alice"); // the referrer under test
  const bob = await mkUser("bob");
  const carol = await mkUser("carol");
  const dave = await mkUser("dave");
  const erin = await mkUser("erin");
  const frank = await mkUser("frank");
  const grace = await mkUser("grace");
  const newbie = await mkUser("newbie"); // never refers anyone

  console.log(`  alice code = ${alice.referralCode}`);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      BASE = `http://127.0.0.1:${server.address().port}`;
      console.log(`  app listening on ${BASE}`);
      resolve();
    });
  });

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== A. auth gate ===");

  let r = await req("GET", "/events/guest/referral/mine");
  eq("A1 anonymous -> 401", r.status, 401);

  r = await req("GET", "/events/guest/referral/mine", {
    cookie: generateToken({ userId: "00000000-0000-0000-0000-000000000000", type: "website_user" }),
  });
  check("A2 unknown user -> 404 (not a 500)", r.status === 404, `got ${r.status}`);

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== B. a user who has referred nobody ===");

  r = await req("GET", "/events/guest/referral/mine", {
    cookie: userCookie(newbie.id),
  });
  eq("B1 -> 200", r.status, 200);
  eq("B2 events is an empty array", r.body?.data?.events, []);
  eq("B3 totalReferrals = 0", r.body?.data?.totalReferrals, 0);
  check(
    "B4 referralCode is minted, not null",
    typeof r.body?.data?.referralCode === "string" && r.body.data.referralCode.length > 0,
    `got ${JSON.stringify(r.body?.data?.referralCode)}`,
  );
  // The tab's empty state is `!referralCode && !events.length`. With a minted
  // code the first half is false, so this user sees the code card plus the
  // "nobody has used your code yet" panel — not the dead-end empty state.
  check(
    "B5 tab renders the code card, not the top-level empty state",
    Boolean(r.body?.data?.referralCode) || r.body?.data?.events?.length > 0,
    "both falsy -> tab would hide the user's own code",
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== C. registering through a referral code (HTTP) ===");

  r = await req("POST", "/events/guest/join", {
    body: joinBody(eventA, bob, { referralCode: alice.referralCode, userId: bob.id }),
  });
  eq("C1 bob joins with alice's code -> 201", r.status, 201);

  r = await req("POST", "/events/guest/join", {
    body: joinBody(eventA, carol, {
      // lower-cased and padded, as a hand-typed or link-mangled code arrives
      referralCode: `  ${alice.referralCode.toLowerCase()} `,
      userId: carol.id,
    }),
  });
  eq("C2 carol joins with a lower-cased, padded code -> 201", r.status, 201);

  r = await req("POST", "/events/guest/join", {
    body: joinBody(eventA, dave, { referralCode: "ZZNOSUCHCODE", userId: dave.id }),
  });
  eq("C3 dave joins with an unknown code -> 201", r.status, 201);

  r = await req("POST", "/events/guest/join", {
    body: joinBody(eventA, alice, { referralCode: alice.referralCode, userId: alice.id }),
  });
  eq("C4 alice joins with her own code -> 201", r.status, 201);

  r = await req("GET", "/events/guest/referral/mine", {
    cookie: userCookie(alice.id),
  });
  const eventARow = r.body?.data?.events?.find((row) => row.event.eventSlug === EVENT_A);

  eq("C5 alice total = 2 (bob + carol)", r.body?.data?.totalReferrals, 2);
  eq("C6 event A card shows 2 registered", eventARow?.total, 2);
  eq("C7 event A card shows 0 approved (all Waitlisted)", eventARow?.approved, 0);
  check("C8 unknown code was not attributed to anyone", r.body?.data?.totalReferrals === 2, "dave leaked in");
  check(
    "C9 self-referral not counted",
    !(await EventGuest.findOne({
      where: { eventId: eventA.id, userId: alice.id },
    }))?.referrerUserId,
    "alice was attributed to herself",
  );
  eq(
    "C10 unknown code still stored on the row for reporting",
    (await EventGuest.findOne({ where: { eventId: eventA.id, userId: dave.id } }))
      ?.referralCode,
    "ZZNOSUCHCODE",
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== D. the payload the live join form actually sends ===");

  // EventDetailsForm has a `referralCode` key in its schema but renders no
  // input for it, so it is always "" — and EventJoinDialog strips "" keys
  // before posting. This reproduces that exact request.
  const uiPayload = joinBody(eventA, erin, { userId: erin.id, referralCode: "" });
  Object.keys(uiPayload).forEach((k) => {
    if (uiPayload[k] === "") delete uiPayload[k];
  });

  check("D1 the live payload carries no referralCode", !("referralCode" in uiPayload));

  r = await req("POST", "/events/guest/join", { body: uiPayload });
  eq("D2 erin joins -> 201", r.status, 201);

  const erinGuest = await EventGuest.findOne({
    where: { eventId: eventA.id, userId: erin.id },
  });
  eq("D3 erin has no referrer", erinGuest?.referrerUserId, null);

  r = await req("GET", "/events/guest/referral/mine", {
    cookie: userCookie(alice.id),
  });
  eq(
    "D4 alice's total is unchanged by a UI-shaped join — the loop cannot close from the UI",
    r.body?.data?.totalReferrals,
    2,
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== E. approved counts and multi-event aggregation ===");

  await EventGuest.update(
    { status: "Approved" },
    { where: { eventId: eventA.id, userId: bob.id } },
  );

  r = await req("POST", "/events/guest/join", {
    body: joinBody(eventB, frank, { referralCode: alice.referralCode, userId: frank.id }),
  });
  eq("E1 frank joins event B with alice's code -> 201", r.status, 201);

  r = await req("POST", "/events/guest/join", {
    body: joinBody(eventB, grace, { referralCode: alice.referralCode, userId: grace.id }),
  });
  eq("E2 grace joins event B with alice's code -> 201", r.status, 201);

  await EventGuest.update(
    { status: "Approved" },
    { where: { eventId: eventB.id, userId: grace.id } },
  );

  r = await req("GET", "/events/guest/referral/mine", {
    cookie: userCookie(alice.id),
  });
  const rows = r.body?.data?.events ?? [];
  const a = rows.find((row) => row.event.eventSlug === EVENT_A);
  const b = rows.find((row) => row.event.eventSlug === EVENT_B);

  eq("E3 two event cards", rows.length, 2);
  eq("E4 event A: 2 registered / 1 approved", [a?.total, a?.approved], [2, 1]);
  eq("E5 event B: 2 registered / 1 approved", [b?.total, b?.approved], [2, 1]);
  eq("E6 totalReferrals is the sum across events", r.body?.data?.totalReferrals, 4);
  eq("E7 event title present for the card heading", a?.event?.eventTitle, "Dashboard Referral Test A");
  check(
    "E8 eventSlug present — the card's React key and its 'Event page' link",
    Boolean(a?.event?.eventSlug) && Boolean(b?.event?.eventSlug),
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== F. contract vs types/Dashboard/DashboardTypes.ts (MyReferrals) ===");

  const data = r.body?.data ?? {};
  eq(
    "F1 top-level keys match MyReferrals exactly",
    Object.keys(data).sort(),
    ["events", "referralCode", "totalReferrals"],
  );
  eq("F2 event row keys match", Object.keys(a ?? {}).sort(), ["approved", "event", "total"]);
  eq(
    "F3 nested event keys match",
    Object.keys(a?.event ?? {}).sort(),
    ["eventSlug", "eventStartDate", "eventTitle"].sort(),
  );
  check("F4 total is a number, not a Postgres count string", typeof a?.total === "number", `got ${typeof a?.total}`);
  check("F5 approved is a number", typeof a?.approved === "number", `got ${typeof a?.approved}`);
  check(
    "F6 no userId anywhere in the response",
    !JSON.stringify(data).includes("userId"),
    "identity leaked into the payload",
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== G. the referee's own view ===");

  // Bob was referred by Alice. His dashboard should be honest about that: he
  // has referred nobody, so no cards — but he still gets his own code.
  r = await req("GET", "/events/guest/referral/mine", {
    cookie: userCookie(bob.id),
  });
  eq("G1 bob -> 200", r.status, 200);
  eq("G2 bob has referred nobody", r.body?.data?.totalReferrals, 0);
  check("G3 bob still has a code to share", Boolean(r.body?.data?.referralCode));
  check(
    "G4 bob's code differs from alice's",
    r.body?.data?.referralCode !== alice.referralCode,
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== CLEANUP ===");
  await cleanup();
  const residue = await User.count({
    where: { email: { [db.Sequelize.Op.like]: `${TAG}%` } },
  });
  eq("Z1 no test users left behind", residue, 0);

  console.log(
    `\n${pass} passed, ${failures.length} failed` +
      (failures.length ? `\n  ${failures.join("\n  ")}` : ""),
  );

  server.close();
  await db.sequelize.close();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await cleanup();
  } catch {
    /* best effort */
  }
  if (server) server.close();
  process.exit(1);
});
