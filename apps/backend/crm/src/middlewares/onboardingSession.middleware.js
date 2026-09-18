const { verifySessionToken } = require("../utils/helper/onboardingToken");
const { ERROR_CODE } = require("../config/constants/onboarding");

/**
 * Gate for the two onboarding endpoints that touch a student's own data.
 *
 * The token proves one thing: this browser held the phone on a lead_profile
 * with an active enrollment, within the last 30 minutes. Its `sub` claim is
 * THE ONLY identifier the handlers behind this trust — no profile id, lead id,
 * phone or email is ever read from the body or the query string, which is why
 * there is no IDOR surface here to get wrong.
 *
 * Carried in X-Onboarding-Token rather than a path segment or query param,
 * because `morgan('tiny')` logs every request URL.
 */
const requireOnboardingSession = (req, res, next) => {
  const token = req.headers["x-onboarding-token"];

  if (!token || typeof token !== "string") {
    return res.status(401).json({
      success: false,
      code: ERROR_CODE.SESSION_INVALID,
      message: "Please verify your phone number again.",
    });
  }

  try {
    const payload = verifySessionToken(token);
    if (!payload.sub) throw new Error("Missing subject");

    req.onboarding = { leadProfileId: payload.sub };
    return next();
  } catch {
    // Expired and forged are the same answer. A student sees "verify again"
    // either way, and an attacker learns nothing about which it was.
    return res.status(401).json({
      success: false,
      code: ERROR_CODE.SESSION_INVALID,
      message: "Your session has expired. Please verify your phone again.",
    });
  }
};

module.exports = { requireOnboardingSession };
