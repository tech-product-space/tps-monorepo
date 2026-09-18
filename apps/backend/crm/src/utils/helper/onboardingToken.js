const jwt = require("jsonwebtoken");
const { OTP, TOKEN_PURPOSE } = require("../../config/constants/onboarding");

/**
 * JWTs for the public onboarding portal — the OTP challenge handle and the
 * post-verification session.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THESE ARE SIGNED WITH ONBOARDING_JWT_SECRET, NOT JWT_SECRET.             │
 * │                                                                          │
 * │ middlewares/auth.middleware.js verifies CRM access tokens with           │
 * │ JWT_SECRET and then does User.findByPk(decoded.id). A session token      │
 * │ signed with the same secret that happened to carry an `id` claim would   │
 * │ be accepted as a signed-in CRM user. A distinct secret makes that        │
 * │ impossible by cryptography rather than by our care in choosing claim     │
 * │ names — and the `purpose` check below makes it impossible twice.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

function getSecret() {
  const secret = process.env.ONBOARDING_JWT_SECRET;
  if (!secret) {
    throw new Error("ONBOARDING_JWT_SECRET is not configured");
  }
  if (secret === process.env.JWT_SECRET) {
    throw new Error(
      "ONBOARDING_JWT_SECRET must differ from JWT_SECRET — see utils/helper/onboardingToken.js",
    );
  }
  return secret;
}

function sign(payload, purpose, expiresIn) {
  return jwt.sign({ ...payload, purpose }, getSecret(), { expiresIn });
}

function verify(token, purpose) {
  const payload = jwt.verify(token, getSecret());
  if (payload.purpose !== purpose) {
    throw new Error("Token purpose mismatch");
  }
  return payload;
}

/**
 * Handle for an in-flight OTP challenge. Carries no authority on its own —
 * holding it without the code that was sent to WhatsApp gets you nothing.
 */
function signOtpToken({ otpId, leadProfileId }) {
  return sign({ otpId, leadProfileId }, TOKEN_PURPOSE.OTP, OTP.TOKEN_TTL);
}

function verifyOtpToken(token) {
  return verify(token, TOKEN_PURPOSE.OTP);
}

/**
 * Proof that this browser holds the phone on a profile with an active
 * enrollment. `sub` is the ONLY identifier the write endpoints trust — nothing
 * identifying is ever accepted from the request body.
 */
function signSessionToken({ leadProfileId }) {
  return sign({ sub: leadProfileId }, TOKEN_PURPOSE.SESSION, OTP.SESSION_TTL);
}

function verifySessionToken(token) {
  return verify(token, TOKEN_PURPOSE.SESSION);
}

module.exports = {
  signOtpToken,
  verifyOtpToken,
  signSessionToken,
  verifySessionToken,
};
