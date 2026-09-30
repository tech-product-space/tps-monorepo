import crypto from "crypto";

import jwt from "jsonwebtoken";

import env from "../config/env.js";
import { PROJECT_UNLOCK_DAYS } from "../config/constants/project.js";

/**
 * Proof that somebody passed a project's gate.
 *
 * **Why a signed cookie and not `localStorage`.** The recordings gate used to
 * keep its unlock in `localStorage` and it was removed for a reason worth not
 * rediscovering: a value in the browser is a *claim* that a thing is unlocked,
 * which the next person on that browser inherits, and which anybody can type
 * into a console. This is the server's own signature over "lead X paid for
 * project Y", and it cannot be forged without the key.
 *
 * **Signed with a key derived from `JWT_SECRET`, never `JWT_SECRET` itself** —
 * the same rule as `previewToken.util.js`, and for the same reason: `adminAuth`
 * accepts anything that verifies against `JWT_SECRET`, so a token signed with
 * it would be a valid admin credential handed to every visitor who filled in a
 * form.
 *
 * Derived rather than configured so there is no new environment variable to
 * forget. Rotating `JWT_SECRET` invalidates every outstanding unlock, which
 * costs those readers one prefilled form.
 */

const LABEL = "gradient.projectUnlock.v1";
const TYP = "project_unlock";

const secret = () =>
  crypto.createHmac("sha256", env.jwt.auth.secret).update(LABEL).digest("hex");

/**
 * @param {{ projectId: string, leadId: string }} claim
 * @returns {string} a JWT good for `PROJECT_UNLOCK_DAYS`
 */
export const signProjectUnlock = ({ projectId, leadId }) =>
  jwt.sign({ typ: TYP, projectId, leadId }, secret(), {
    expiresIn: `${PROJECT_UNLOCK_DAYS}d`,
  });

/**
 * Verifies a token **against the project being read**.
 *
 * The scope check is the point: without it, one unlock would open every gated
 * guide on the site, and the lead rows would stop describing who read what.
 *
 * @returns {{ projectId: string, leadId: string } | null}
 */
export const verifyProjectUnlock = (token, projectId) => {
  if (!token || !projectId) return null;

  try {
    const decoded = jwt.verify(token, secret());

    if (decoded?.typ !== TYP) return null;
    if (decoded?.projectId !== projectId) return null;

    return { projectId: decoded.projectId, leadId: decoded.leadId };
  } catch {
    // Expired, tampered with, or signed by something else. All the same answer:
    // this browser has not paid for this project.
    return null;
  }
};

const isProduction = env.APP_ENVIRONMENT === "production";

/** Cookie options shared by every place that sets one, so they cannot drift. */
export const unlockCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  // The site and the API are different hosts in production, so the browser
  // only sends this back on cross-site requests when it is `none` + `secure` —
  // the same pair the auth cookie uses.
  sameSite: isProduction ? "none" : "lax",
  maxAge: PROJECT_UNLOCK_DAYS * 24 * 60 * 60 * 1000,
});
