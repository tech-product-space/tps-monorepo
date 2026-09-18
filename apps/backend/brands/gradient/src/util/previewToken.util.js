import crypto from "crypto";

import jwt from "jsonwebtoken";

import env from "../config/env.js";

/**
 * Preview tokens. `FREE_COURSE_PREVIEW_PLAN.md` §3, §4.1.
 *
 * These lift the publish filters off the public read endpoints, so they are the
 * most dangerous credential in the product that is not an admin login. Three
 * things bound them, and all three matter:
 *
 *   scope    one resource id + slug, checked against the resource being read
 *   expiry   minutes, not days
 *   use      the launch token dies the first time it is redeemed
 *
 * **Signed with a key derived from `JWT_SECRET`, never `JWT_SECRET` itself** —
 * the same reasoning as `services/subscriber/unsubscribeToken.js`. `adminAuth`
 * accepts any token that verifies against `JWT_SECRET` and does no further
 * check, so a preview token signed with it would be a valid admin bearer token,
 * handed out in a URL, every time an admin clicked Preview.
 *
 * Derived rather than configured so there is no new environment variable to
 * forget, and no deploy where preview silently stops working. Rotating
 * `JWT_SECRET` invalidates outstanding preview links, which is correct — they
 * are minutes-long anyway.
 *
 * ── Two kinds, two keys ─────────────────────────────────────────────────────
 *
 * Free courses and recordings each get their own derived key and their own
 * `typ` claim. That is not tidiness: a recording preview token must be inert
 * against the free-course endpoints and vice versa, and separate keys make that
 * structural rather than a comparison somebody has to remember to write. The
 * cost is one line per kind.
 *
 * The `v1` label is a version marker: changing it rotates that kind's preview
 * tokens alone, without touching sessions or unsubscribe links.
 */

const KINDS = {
  freeCourse: {
    label: "gradient.freeCoursePreview.v1",
    launch: "free_course_preview_launch",
    session: "free_course_preview_session",
  },
  recording: {
    label: "gradient.recordingPreview.v1",
    launch: "recording_preview_launch",
    session: "recording_preview_session",
  },
  project: {
    label: "gradient.projectPreview.v1",
    launch: "project_preview_launch",
    session: "project_preview_session",
  },
};

const secretFor = (label) =>
  crypto
    .createHmac("sha256", env.jwt.auth.secret)
    .update(label)
    .digest("hex");

/**
 * Spent launch tokens, by `jti`, until the moment they would have expired
 * anyway. Nothing is stored beyond that — a token past its own expiry is
 * refused by `jwt.verify` long before it reaches here.
 *
 * Shared across kinds because `jti` is a UUID; there is nothing to keep apart.
 *
 * **Deliberately in-process, not Redis.** The first version of this used the
 * workflow Redis connection, and that was wrong twice over: it made single use
 * vanish silently wherever `WORKFLOWS_ENABLED` was off — coupling preview to an
 * unrelated switch — and it put a network round trip, with a timeout and a
 * fail-open branch, in front of a set membership test.
 *
 * The honest cost of this choice: a token could be redeemed once per API
 * instance, and a restart forgets everything. That is acceptable for what this
 * is. Single use is defence in depth *over* the fifteen-minute expiry and the
 * resource scope, not the thing holding the door shut — and unlike the Redis
 * version, this one cannot quietly stop working.
 */
const spent = new Map();

/** Seconds left on a decoded token, floored at zero. */
export const secondsRemaining = (decoded) =>
  Math.max(0, (decoded?.exp ?? 0) - Math.floor(Date.now() / 1000));

/**
 * Marks a launch token spent. Returns false if it already was.
 *
 * Synchronous in effect, `async` in signature: callers await it, and a future
 * shared store would need to be awaited anyway.
 */
export const burnLaunchToken = async (decoded) => {
  if (!decoded?.jti) return true;

  const ttlSeconds = secondsRemaining(decoded);

  if (ttlSeconds <= 0) return false;

  // Swept on the way past rather than on a timer, so nothing here holds a
  // handle open or keeps the process alive. The map only ever holds the
  // preview links minted in the last few minutes.
  const now = Date.now();

  for (const [jti, expiresAt] of spent) {
    if (expiresAt <= now) spent.delete(jti);
  }

  if (spent.has(decoded.jti)) return false;

  spent.set(decoded.jti, now + ttlSeconds * 1_000);

  return true;
};

/**
 * The mint/verify pair for one kind of previewable resource.
 *
 * `resourceId` and `slug` are the scope. Every consumer compares both against
 * the thing actually being read, so a token minted for one row cannot open
 * another — see `middlewares/previewAuth.middleware.js`.
 */
const previewTokensFor = (kind) => {
  const config = KINDS[kind];

  if (!config) throw new Error(`Unknown preview kind: ${kind}`);

  const secret = secretFor(config.label);

  const verify = (token, expectedType) => {
    const decoded = jwt.verify(token, secret);

    // The type claim is the whole point of splitting the two tokens. Without it
    // a launch token — the one that leaks — would be replayable as a session
    // token and would stop being single-use.
    if (decoded?.typ !== expectedType) {
      throw new Error("Wrong preview token type");
    }

    return decoded;
  };

  return {
    /**
     * The token that travels in the query string.
     *
     * Query strings end up in browser history and in `Referer`, so this one is
     * short-lived and single-use. It buys exactly one thing: the right to
     * exchange it, once, for a session token.
     */
    generateLaunchToken: ({ resourceId, slug, adminId }) =>
      jwt.sign(
        {
          typ: config.launch,
          resourceId,
          slug,
          adminId,
          jti: crypto.randomUUID(),
        },
        secret,
        { expiresIn: env.preview.launchTtl },
      ),

    /**
     * The token that lives in the httpOnly cookie.
     *
     * Presented on every read for the rest of the session, so it cannot be
     * single-use — burning it would kill the preview on its own first page. It
     * never appears in a URL, which is what makes the longer life acceptable.
     */
    generateSessionToken: ({ resourceId, slug, adminId }) =>
      jwt.sign({ typ: config.session, resourceId, slug, adminId }, secret, {
        expiresIn: env.preview.sessionTtl,
      }),

    verifyLaunchToken: (token) => verify(token, config.launch),
    verifySessionToken: (token) => verify(token, config.session),
  };
};

export const freeCoursePreviewTokens = previewTokensFor("freeCourse");
export const recordingPreviewTokens = previewTokensFor("recording");
export const projectPreviewTokens = previewTokensFor("project");
