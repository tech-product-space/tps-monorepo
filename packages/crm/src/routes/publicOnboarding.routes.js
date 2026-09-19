const psEnv = require("@ps/env/crm");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const controller = require("../controllers/onboarding/publicOnboarding.controller");
const {
  requireOnboardingSession,
} = require("../middlewares/onboardingSession.middleware");
const { ERROR_CODE } = require("../config/constants/onboarding");

const router = express.Router();

// BASE URL -> /api/v1/public/onboarding
//
// This router is ANONYMOUS. It is mounted in index.js next to webhookRoutes,
// before the authenticated routers and before the global 5 MB JSON parser, and
// it brings its own CORS, its own body limit and its own rate limiters rather
// than inheriting the app's — the app's are sized for signed-in staff.

/* ─── Boot-time config check ───────────────────────────────────────────────── */

// This router is required from index.js at startup, so these run once, before
// the server accepts anything.
//
// The secret check lives HERE rather than only inside onboardingToken.js
// because that one is lazy — it fires when a token is signed, which is after
// the OTP row has been written and, in live mode, after a WhatsApp template
// message has already been sent and paid for. A misconfigured deploy should
// refuse to start, not charge us to discover the problem one student at a time.
(function assertConfig() {
  const secret = psEnv.ONBOARDING_JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "ONBOARDING_JWT_SECRET is missing or too short (need 32+ chars; use `openssl rand -hex 32`). " +
        "The onboarding portal cannot start without it.",
    );
  }

  if (secret === psEnv.JWT_SECRET) {
    throw new Error(
      "ONBOARDING_JWT_SECRET must differ from JWT_SECRET — a shared secret would let " +
        "an anonymous onboarding session token pass as a signed-in CRM user.",
    );
  }

  if (psEnv.NODE_ENV === "production" && !psEnv.PUBLIC_FORM_URL) {
    // Without it the CORS allowlist below is empty and every request from the
    // portal is refused — a failure that looks like a network outage from the
    // student's side and shows up nowhere in our logs.
    throw new Error(
      "PUBLIC_FORM_URL must be set in production — it is the onboarding router's CORS allowlist.",
    );
  }

  if (psEnv.OTP_MODE !== "live") {
    console.warn(
      "[onboarding] OTP_MODE is not 'live' — codes will be printed to this console, not sent over WhatsApp.",
    );
  }
})();

/* ─── Security headers + logging ───────────────────────────────────────────── */

// This router is mounted ahead of the app-wide helmet() and morgan() so that
// the global cors() cannot intercept its preflight (see index.js). That means
// it has to bring both itself — otherwise the one anonymous surface in the app
// would be the only one without security headers or a request log.
router.use(helmet());
router.use(morgan("tiny"));

/* ─── CORS: the portal origin only ─────────────────────────────────────────── */

// Deliberately NOT the allowlist in index.js. That list includes the CRM and
// the marketing site; none of them has any business calling this.
const allowedOrigins = [
  psEnv.PUBLIC_FORM_URL,
  // Local portal dev server (Next.js defaults to 3000).
  psEnv.NODE_ENV !== "production" ? "http://localhost:3000" : null,
].filter(Boolean);

router.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Onboarding-Token"],
    // No cookies are involved anywhere in this flow — the session token travels
    // in a header — so credentials stay off.
    credentials: false,
    maxAge: 600,
  }),
);

/* ─── Body limit ───────────────────────────────────────────────────────────── */

// The largest legitimate submission is three 2000-character paragraphs plus a
// handful of short fields. 32 kb is generous; the global 5 MB parser would be
// free DoS surface on an endpoint strangers can hit.
router.use(express.json({ limit: "32kb" }));

/* ─── Rate limits ──────────────────────────────────────────────────────────── */

const limited = (message) => ({
  success: false,
  code: ERROR_CODE.RATE_LIMITED,
  message,
});

/**
 * Local-development escape hatch.
 *
 * Testing this flow means calling /start over and over, and the IP limits are
 * sized for strangers, not for someone iterating on the form. Setting
 * ONBOARDING_RATELIMIT_DISABLED=true in .env skips every limiter below.
 *
 * Two guards, because a rate limiter that silently switches itself off is
 * worse than none at all:
 *
 *   1. It is OPT-IN. The default is off, so a deploy that forgets to set
 *      anything is protected. (`skip: () => NODE_ENV !== 'production'` would be
 *      the tempting shorthand and is a trap — NODE_ENV is routinely unset in
 *      production, which would disable the limiters exactly where they matter.)
 *   2. NODE_ENV === 'production' overrides it regardless, so the flag leaking
 *      into a production env file still cannot open the endpoint up.
 *
 * The per-challenge controls in onboardingPortal.service.js — 5 attempts,
 * 3 resends, the 60s cooldown — are NOT affected by this. Those live in
 * Postgres and stay on. Clear them with:
 *   DELETE FROM onboarding_otps;
 */
const rateLimitDisabled =
  psEnv.ONBOARDING_RATELIMIT_DISABLED === "true" &&
  psEnv.NODE_ENV !== "production";

if (rateLimitDisabled) {
  console.warn(
    "[onboarding] ⚠  RATE LIMITING DISABLED (ONBOARDING_RATELIMIT_DISABLED=true). Local development only.",
  );
}

// Applied to every limiter, so there is one switch rather than seven.
const skipInDev = () => rateLimitDisabled;

const TOO_MANY =
  "Too many attempts. Please wait a few minutes and try again.";

// Per IP. The first line of defence, and the only one that applies before we
// know who is asking.
const startByIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: limited(TOO_MANY),
});

const startByIpDaily = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: limited(TOO_MANY),
});

/**
 * Per phone number — the limit that protects the WhatsApp bill and stops one
 * student's phone being used to harass them from a rotating set of IPs.
 *
 * Keyed on the last 10 digits of whatever was typed, so +919876543210 and
 * 9876543210 share a bucket. Keying on the resolved lead_profile_id would be
 * tighter, but the limiter has to run before the handler that resolves it.
 */
const startByPhone = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  keyGenerator: (req) =>
    String(req.body?.phone ?? "")
      .replace(/\D/g, "")
      .slice(-10) || "unknown",
  message: limited(
    "We've already sent a few codes to this number. Please wait an hour, or reply to your onboarding email.",
  ),
});

/**
 * Consecutive misses. Guessing at random which numbers are enrolled costs an
 * attacker their IP for an hour after forty-five wrong answers, while a real
 * student who mistypes once is unaffected — successful lookups don't count.
 *
 * Keep this below what startByIp allows in the same hour (15 per 15 min = 60),
 * or it can never fire and the enumeration control is decorative.
 */
const startMisses = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 45,
  standardHeaders: false,
  legacyHeaders: false,
  skip: skipInDev,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode < 400,
  message: limited(TOO_MANY),
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: limited(TOO_MANY),
});

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: limited(TOO_MANY),
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: limited(TOO_MANY),
});

/* ─── Routes ───────────────────────────────────────────────────────────────── */

router.post(
  "/start",
  startByIp,
  startByIpDaily,
  startByPhone,
  startMisses,
  controller.start,
);
router.post("/verify", verifyLimiter, controller.verify);
router.post("/resend", resendLimiter, controller.resend);

router.get("/me", requireOnboardingSession, controller.me);
router.post(
  "/profile",
  submitLimiter,
  requireOnboardingSession,
  controller.submit,
);

module.exports = router;
