/**
 * What number would the onboarding portal actually dial?
 *
 * Answers that without a database, a WhatsApp send, or a foreign SIM — it
 * calls the real normalisePhoneInput from onboardingPortal.service.js, which
 * is the only thing the +7 delivery bug was ever about.
 *
 *   node scripts/check-phone.js              # run the regression table
 *   node scripts/check-phone.js +7 7015550123   # check one number
 *
 * Exits non-zero if any case in the table fails, so it can go in CI later.
 */

const {
  normalisePhoneInput,
} = require("../src/services/onboardingPortal.service");

const dial = (cc, phone) => {
  const n = normalisePhoneInput(cc, phone);
  return { dialable: `${n.cc}${n.national}`, ...n };
};

/* ─── One-off mode ─────────────────────────────────────────────────────────── */

const [, , argCc, argPhone] = process.argv;

if (argCc && argPhone) {
  const n = dial(argCc, argPhone);
  console.log(`\n  typed      ${argCc} ${argPhone}`);
  console.log(`  dialled    +${n.dialable}      <- what Meta receives`);
  console.log(`  national   ${n.national}`);
  console.log(`  lookup     ${n.candidates.join(", ")}\n`);
  process.exit(0);
}

/* ─── Regression table ─────────────────────────────────────────────────────── */

// [country code, what the student types, what must be dialled, why it's here]
const CASES = [
  ["+7", "7015550123", "77015550123", "Kazakh mobile — the reported bug"],
  ["+7", "77015550123", "77015550123", "same number, country code typed twice"],
  ["+91", "9769438216", "919769438216", "India, the common case"],
  ["+91", "919769438216", "919769438216", "India, country code typed twice"],
  ["+91", "09769438216", "919769438216", "India, leading trunk zero"],
  ["+91", "9187654321", "919187654321", "Indian mobile that starts with 91"],
  ["+44", "7712345678", "447712345678", "UK mobile"],
  ["+44", "07712345678", "447712345678", "UK, trunk zero"],
  ["+1", "2125551234", "12125551234", "US"],
  ["+1", "12125551234", "12125551234", "US, country code typed twice"],
  ["+971", "501234567", "971501234567", "UAE, 9-digit national"],
  ["+65", "81234567", "6581234567", "Singapore, 8-digit national"],
  ["+61", "412345678", "61412345678", "Australia"],
  ["+49", "015112345678", "4915112345678", "Germany, trunk zero"],
];

let failed = 0;

for (const [cc, typed, expected, why] of CASES) {
  const got = dial(cc, typed).dialable;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${`${cc} ${typed}`.padEnd(20)}-> +${got.padEnd(
      14,
    )}${ok ? "" : `expected +${expected}  `}${why}`,
  );
}

console.log(
  failed
    ? `\n${failed} of ${CASES.length} failed\n`
    : `\nall ${CASES.length} passed\n`,
);

process.exit(failed ? 1 : 0);
