/**
 * Phase 1 smoke check. No DB, no network — exercises the pure pieces:
 * token round-trip, cross-secret rejection, and the rendered footer.
 */
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from "../services/subscriber/unsubscribeToken.js";
import {
  BODIES,
  buildEmail,
  FOOTERS,
  HEADERS,
} from "../services/email/index.js";
import env from "../config/env.js";
import { verifyToken } from "../util/jwt.util.js";

let pass = 0;
const ok = (name) => { pass++; console.log(`  ok  ${name}`); };

// ── Token round-trip ────────────────────────────────────────────────────────
const token = generateUnsubscribeToken("  Person@Example.COM ", "01JCAMPAIGN");
const decoded = verifyUnsubscribeToken(token);

assert.equal(decoded.email, "person@example.com");
ok("email is normalised to lowercase and trimmed");

assert.equal(decoded.campaignId, "01JCAMPAIGN");
ok("campaignId survives the round trip");

// ── No expiry ───────────────────────────────────────────────────────────────
assert.equal(jwt.decode(token).exp, undefined);
ok("token carries no expiry (a two-year-old link still works)");

// ── The security property this whole design turns on ────────────────────────
// adminAuth accepts ANY token that verifies against JWT_SECRET and sets
// req.admin straight from the payload. An unsubscribe token is printed in every
// marketing email, so it must NOT verify against that secret.
assert.throws(() => verifyToken(token));
ok("unsubscribe token is REJECTED by the admin/user JWT verifier");

const adminish = jwt.sign({ id: "x", role: "Super Admin" }, env.jwt.auth.secret);
assert.equal(verifyUnsubscribeToken(adminish), null);
ok("an admin-secret token is rejected by the unsubscribe verifier");

// ── Malformed input never throws ────────────────────────────────────────────
for (const bad of [null, undefined, "", "not-a-token", 42, {}]) {
  assert.equal(verifyUnsubscribeToken(bad), null);
}
ok("garbage tokens return null rather than throwing");

// ── URL shape ───────────────────────────────────────────────────────────────
const url = buildUnsubscribeUrl("person@example.com", "01JCAMPAIGN");
assert.ok(url.startsWith(`${env.publicSiteUrl}/unsubscribe?token=`), url);
ok("unsubscribe URL points at the public site's /unsubscribe");

// ── The footer actually renders into the email ──────────────────────────────
// This is the bit gradientLayout was silently dropping before phase 1.
const html = buildEmail({
  header: HEADERS.GRADIENT,
  body: BODIES.CUSTOM("<p>Hello {{name}}</p>", { name: "Asha" }),
  footer: FOOTERS.GRADIENT_MARKETING,
  footerProps: { unsubscribeUrl: url },
});

assert.ok(html.includes("Hello Asha"), "body missing");
ok("body renders with {{name}} substituted");

assert.ok(html.includes(url), "unsubscribe URL missing from rendered email");
ok("unsubscribe link renders in the marketing footer");

assert.ok(html.includes(">Unsubscribe</a>"));
ok("footer copy renders");

// ── Transactional mail is unchanged ─────────────────────────────────────────
const transactional = buildEmail({
  header: HEADERS.GRADIENT,
  body: "<p>Your certificate is ready.</p>",
  footer: FOOTERS.GRADIENT,
});

assert.ok(!transactional.includes("Unsubscribe"));
ok("transactional email carries no unsubscribe link");

assert.ok(!transactional.includes("<h1"));
ok("transactional email gained no header block (layout change is invisible)");

// ── A footer with no URL renders nothing rather than a dead link ────────────
assert.equal(FOOTERS.GRADIENT_MARKETING({}), "");
ok("marketing footer without a URL renders empty, not a broken link");

console.log(`\n${pass} checks passed`);
