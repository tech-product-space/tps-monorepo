import crypto from "crypto";
import jwt from "jsonwebtoken";

import env from "../../config/env.js";

/**
 * Signing key for unsubscribe links.
 *
 * **Deliberately not `JWT_SECRET` itself.** `adminAuth` accepts any token that
 * verifies against `JWT_SECRET` and performs no further check — it sets
 * `req.admin` straight from the payload. An unsubscribe token is printed into
 * the footer of every marketing email, so it is public by construction; signing
 * it with the same key would put a valid admin bearer token in the hands of
 * every recipient.
 *
 * Derived rather than configured so there is no new environment variable to
 * forget in an environment, and no deployment where unsubscribe links silently
 * stop verifying. Rotating `JWT_SECRET` invalidates old unsubscribe links along
 * with everything else, which is the correct behaviour.
 *
 * The `v1` label is a version marker: changing it rotates unsubscribe tokens
 * alone, without touching sessions.
 */
const UNSUBSCRIBE_SECRET = crypto
  .createHmac("sha256", env.jwt.auth.secret)
  .update("gradient.unsubscribe.v1")
  .digest("hex");

const TOKEN_TYPE = "unsubscribe";

/**
 * Mints the token that goes in an email's unsubscribe link.
 *
 * **No expiry.** A link in a two-year-old email must still work — an opt-out
 * that has quietly stopped working is worse than no opt-out at all, because the
 * person believes they have left.
 *
 * @param {string} email       recipient address, stored lowercased
 * @param {string} [campaignId] the send this link came from, for attribution
 */
export const generateUnsubscribeToken = (email, campaignId = null) => {
  return jwt.sign(
    {
      type: TOKEN_TYPE,
      email: String(email).trim().toLowerCase(),
      campaignId,
    },
    UNSUBSCRIBE_SECRET,
  );
};

/**
 * Verifies a token and returns `{ email, campaignId }`, or null.
 *
 * Never throws: every caller here is a public endpoint answering a link someone
 * clicked, and the honest response to a mangled link is "this link is not
 * valid", not a 500.
 */
export const verifyUnsubscribeToken = (token) => {
  if (!token || typeof token !== "string") return null;

  try {
    const decoded = jwt.verify(token, UNSUBSCRIBE_SECRET);

    // A token signed with this key can only be one of ours, but the check
    // keeps the payload shape honest if a second purpose is ever added.
    if (decoded?.type !== TOKEN_TYPE || !decoded?.email) return null;

    return {
      email: decoded.email,
      campaignId: decoded.campaignId ?? null,
    };
  } catch {
    return null;
  }
};

/**
 * The full URL that goes in the email footer.
 *
 * `publicSiteUrl` is the same value certificate emails link to, so there is one
 * place to change when the public origin moves.
 */
export const buildUnsubscribeUrl = (email, campaignId = null) => {
  const token = generateUnsubscribeToken(email, campaignId);

  return `${env.publicSiteUrl.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
};
