/**
 * Verification of certificate number generation and its uniqueness guarantee.
 *
 *   node src/test/certificateNumber.itest.js
 *
 * Three separate questions, because they have three different answers:
 *
 *   1. Is the generator well-formed and unbiased?   (pure, no DB)
 *   2. Does the database actually refuse a repeat?  (real constraint)
 *   3. What happens at the call sites when one does collide?
 *
 * Every row it creates is namespaced and deleted at the end.
 */

import db from "../database/postgres/models/index.js";
import { generateCertificateNumber } from "../util/helpers/certificateNumber.js";
import { EVENT_CERTIFICATE_STATUS } from "../config/constants/eventCertificate.js";

const { Event, EventCertificate } = db;

const TAG = "zz-certno-itest";
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
  check(name, ok, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function cleanup() {
  const event = await Event.findOne({ where: { eventSlug: EVENT_SLUG } });
  if (event) {
    await EventCertificate.destroy({ where: { eventId: event.id } });
    await Event.destroy({ where: { id: event.id } });
  }
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

async function main() {
  await cleanup();

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== A. shape ===");

  const sample = generateCertificateNumber();
  console.log(`  sample: ${sample}`);

  const FORMAT = /^GRD-\d{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
  check("A1 matches GRD-YYYY-XXXXXXXX", FORMAT.test(sample), sample);
  eq("A2 total length is 17", sample.length, 17);
  eq("A3 alphabet is exactly 32 symbols", ALPHABET.length, 32);
  check(
    "A4 alphabet excludes I, L, O, U (the misread characters)",
    !/[ILOU]/.test(ALPHABET),
  );
  eq(
    "A5 year comes from the passed date, not the clock",
    generateCertificateNumber(new Date("2031-06-01T00:00:00Z")).slice(0, 8),
    "GRD-2031",
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== B. randomness quality (200,000 draws) ===");

  const N = 200_000;
  const seen = new Set();
  const freq = new Map([...ALPHABET].map((c) => [c, 0]));
  let malformed = 0;

  for (let i = 0; i < N; i += 1) {
    const code = generateCertificateNumber();
    if (!FORMAT.test(code)) malformed += 1;
    seen.add(code);
    for (const ch of code.slice(9)) freq.set(ch, freq.get(ch) + 1);
  }

  eq("B1 no malformed codes in 200k", malformed, 0);

  const dupes = N - seen.size;
  // 200k draws from a 2^40 space: expected collisions ≈ n²/2N ≈ 0.018.
  // Seeing more than a couple would mean the entropy source is not what it
  // claims to be.
  check(`B2 in-run duplicates ≤ 2 (got ${dupes})`, dupes <= 2);

  // crypto.randomBytes gives a byte in [0,255] and 256 % 32 === 0, so the
  // `% ALPHABET.length` fold is exactly uniform — no modulo bias. Verified
  // rather than assumed: change the alphabet to a non-power-of-two length and
  // this is the assertion that catches it.
  eq("B3 256 is divisible by the alphabet size — no modulo bias", 256 % ALPHABET.length, 0);

  const counts = [...freq.values()];
  const expected = (N * 8) / ALPHABET.length;
  const worstDrift = Math.max(...counts.map((c) => Math.abs(c - expected) / expected));
  check(
    `B4 character distribution within 5% of uniform (worst ${(worstDrift * 100).toFixed(2)}%)`,
    worstDrift < 0.05,
  );
  check("B5 every symbol in the alphabet actually appears", counts.every((c) => c > 0));

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== C. the database refuses a repeat ===");

  const event = await Event.create({
    eventTitle: "Certificate Number Test",
    eventSlug: EVENT_SLUG,
    eventType: "Workshop",
    eventCategory: "Normal",
    eventStartDate: "2026-12-01",
    eventEndDate: "2026-12-01",
    eventStartTime: "18:00",
    eventEndTime: "19:00",
    isPublished: false,
    location: "Online",
  });

  const [constraints] = await db.sequelize.query(`
    select pg_get_constraintdef(con.oid) as def
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'EventCertificates' and con.contype = 'u'`);
  const defs = constraints.map((c) => c.def);

  check(
    "C1 a UNIQUE constraint on certificateNo exists in the live schema",
    defs.some((d) => d.includes('UNIQUE ("certificateNo")')),
    defs.join(" | "),
  );

  const fixed = generateCertificateNumber();

  const mkCert = (email, certificateNo) =>
    EventCertificate.create({
      eventId: event.id,
      certificateNo,
      recipientName: "Test Recipient",
      recipientEmail: email,
      source: "Attendee",
      status: EVENT_CERTIFICATE_STATUS.PENDING,
    });

  await mkCert(`${TAG}-one@example.invalid`, fixed);

  let threw = null;
  try {
    // Different person, different event-email pair — only the number repeats.
    await mkCert(`${TAG}-two@example.invalid`, fixed);
  } catch (err) {
    threw = err;
  }

  check("C2 a second row with the same certificateNo is rejected", threw !== null);
  eq(
    "C3 rejected by the certificateNo constraint specifically",
    threw?.parent?.constraint,
    "EventCertificates_certificateNo_key",
  );
  eq(
    "C4 only one row survived",
    await EventCertificate.count({ where: { certificateNo: fixed } }),
    1,
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== D. what the bulk call sites do with a collision ===");

  // Both bulk insert paths — createRecipients() and the auto-issue service —
  // pass `ignoreDuplicates: true` to dedupe on (eventId, recipientEmail).
  // ON CONFLICT DO NOTHING has no way to name *which* constraint it forgives,
  // so it forgives a certificateNo collision on the same terms.
  const before = await EventCertificate.count({ where: { eventId: event.id } });

  const returned = await EventCertificate.bulkCreate(
    [
      {
        eventId: event.id,
        certificateNo: fixed, // collides with C's row
        recipientName: "Collision Victim",
        recipientEmail: `${TAG}-three@example.invalid`,
        source: "Attendee",
        status: EVENT_CERTIFICATE_STATUS.PENDING,
      },
    ],
    { ignoreDuplicates: true },
  );

  const after = await EventCertificate.count({ where: { eventId: event.id } });

  eq("D1 no error thrown — the collision is swallowed", after - before, 0);
  check(
    "D2 bulkCreate still returns an instance for the row it dropped",
    returned.length === 1,
    `returned ${returned.length}`,
  );
  // Worse than a null id: the ULID default runs in JS before the insert, so a
  // dropped row comes back carrying a real-looking id that is in no table.
  // `created.length` therefore over-reports, and the id cannot be used to tell
  // an inserted row from a skipped one.
  check(
    "D3 the dropped row carries a client-minted id that exists nowhere in the DB",
    Boolean(returned[0]?.id) &&
      (await EventCertificate.count({ where: { id: returned[0].id } })) === 0,
    `id was ${returned[0]?.id}`,
  );
  eq(
    "D4 the recipient ends up with no certificate at all",
    await EventCertificate.count({
      where: { eventId: event.id, recipientEmail: `${TAG}-three@example.invalid` },
    }),
    0,
  );

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== E. collision odds at real volumes (per year) ===");

  const SPACE = Math.pow(ALPHABET.length, 8);
  const odds = (n) => 1 - Math.exp((-n * (n - 1)) / (2 * SPACE));

  eq("E1 namespace is 32^8 ≈ 1.1e12 per year prefix", SPACE, 1099511627776);
  for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
    const p = odds(n);
    console.log(
      `  ${String(n).padStart(9)} certs/yr → P(any collision) = ${p.toExponential(2)}  (~1 in ${Math.round(1 / p).toLocaleString()})`,
    );
  }
  check("E2 under 1-in-10,000 odds at 10k certificates a year", odds(10_000) < 1e-4);

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== CLEANUP ===");
  await cleanup();
  eq("Z1 no test rows left behind", await Event.count({ where: { eventSlug: EVENT_SLUG } }), 0);

  console.log(
    `\n${pass} passed, ${failures.length} failed` +
      (failures.length ? `\n  ${failures.join("\n  ")}` : ""),
  );

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
  process.exit(1);
});
