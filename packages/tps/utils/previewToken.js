const psEnv = require("@ps/env/tps");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

/**
 * Preview tokens. `RECORDINGS_PLAN.md` §16.
 *
 * These lift the publish filters off a public read endpoint and release a video
 * the gate is withholding, so they are the most dangerous credential in the
 * product that is not a staff login. Three things bound them, and all three
 * matter:
 *
 *   scope    one resource id + slug, checked against the row being read
 *   expiry   minutes, not days
 *   use      the launch token dies the first time it is redeemed
 *
 * **Signed with a key derived from `JWT_SECRET`, never `JWT_SECRET` itself.**
 * Every auth middleware in this API — `requireStaff`, `requireUser`,
 * `optionalUser` — verifies against `JWT_SECRET` and then reads claims off
 * whatever came back. A preview token signed with it would be a token those
 * middlewares consider authentic, handed out in a URL, every time somebody
 * clicked Preview. Today they would still refuse it for want of a `user_id` or
 * a `role`; deriving the key means that refusal is structural rather than an
 * accident of which claims this file happens to set.
 *
 * Derived rather than configured so there is no new environment variable to
 * forget, and no deploy where preview silently stops working. Rotating
 * `JWT_SECRET` invalidates outstanding preview links, which is correct — they
 * are minutes long anyway.
 *
 * ── One key per kind ────────────────────────────────────────────────────────
 *
 * Each previewable thing gets its *own* derived key and its own `typ`, so that
 * one kind's token is inert against another — structurally, not by a comparison
 * somebody has to remember to write.
 *
 * The `v1` label is a version marker: changing it rotates that kind's preview
 * tokens alone, without touching sessions or any other signed link.
 */

const SECRET_KEY = require("./jwtSecret");

/** In the URL, so short. Long enough to survive a slow save-then-open. */
const LAUNCH_TTL = psEnv.PREVIEW_LAUNCH_TTL || "15m";

/** In an httpOnly cookie, never in a URL — one editing session's worth. */
const SESSION_TTL = psEnv.PREVIEW_SESSION_TTL || "60m";

const KINDS = {
  recording: {
    label: "tps.recordingPreview.v1",
    launch: "recording_preview_launch",
    session: "recording_preview_session",
  },
  lesson: {
    label: "tps.lessonPreview.v1",
    launch: "lesson_preview_launch",
    session: "lesson_preview_session",
  },
};

const secretFor = (label) =>
  crypto.createHmac("sha256", SECRET_KEY).update(label).digest("hex");

/**
 * Spent launch tokens, by `jti`, until the moment they would have expired
 * anyway. Nothing is kept beyond that — a token past its own expiry is refused
 * by `jwt.verify` long before it reaches here.
 *
 * **Deliberately in-process, not Redis.** Single use is defence in depth *over*
 * the fifteen-minute expiry and the resource scope, not the thing holding the
 * door shut, and this API's Redis is the workflow engine's — putting a network
 * round trip with a fail-open branch in front of a set membership test would
 * make preview quietly stop being single-use wherever that connection is down.
 *
 * The honest cost: a token could be redeemed once per API instance, and a
 * restart forgets everything.
 */
const spent = new Map();

/** Seconds left on a decoded token, floored at zero. */
const secondsRemaining = (decoded) =>
  Math.max(0, (decoded?.exp ?? 0) - Math.floor(Date.now() / 1000));

/**
 * Marks a launch token spent. Returns false if it already was.
 *
 * `async` in signature though synchronous in effect: callers await it, and a
 * future shared store would have to be awaited anyway.
 */
const burnLaunchToken = async (decoded) => {
  if (!decoded?.jti) return true;

  const ttlSeconds = secondsRemaining(decoded);

  if (ttlSeconds <= 0) return false;

  // Swept on the way past rather than on a timer, so nothing here holds a
  // handle open or keeps the process alive. The map only ever holds the preview
  // links minted in the last few minutes.
  const now = Date.now();

  for (const [jti, expiresAt] of spent) {
    if (expiresAt <= now) spent.delete(jti);
  }

  if (spent.has(decoded.jti)) return false;

  spent.set(decoded.jti, now + ttlSeconds * 1000);

  return true;
};

/**
 * The mint/verify pair for one kind of previewable resource.
 *
 * `resourceId` and `slug` are the scope. Every consumer compares both against
 * the thing actually being read, so a token minted for one row cannot open
 * another — see `middlewares/previewAuth.js`.
 *
 * `scope` carries any extra claims a kind needs to pin itself down. A lesson
 * lives at course/module/lesson and is only unique across all three, so its
 * token names all three and the middleware checks all three; a slug on its own
 * would open the same-named lesson in somebody else's course.
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
    generateLaunchToken: ({ resourceId, slug, staffId, scope = {} }) =>
      jwt.sign(
        {
          ...scope,
          typ: config.launch,
          resourceId,
          slug,
          staffId,
          jti: crypto.randomUUID(),
        },
        secret,
        { expiresIn: LAUNCH_TTL }
      ),

    /**
     * The token that lives in the httpOnly cookie.
     *
     * Presented on every read for the rest of the session, so it cannot be
     * single-use — burning it would kill the preview on its own first page. It
     * never appears in a URL, which is what makes the longer life acceptable.
     */
    generateSessionToken: ({ resourceId, slug, staffId, scope = {} }) =>
      jwt.sign(
        { ...scope, typ: config.session, resourceId, slug, staffId },
        secret,
        { expiresIn: SESSION_TTL }
      ),

    verifyLaunchToken: (token) => verify(token, config.launch),
    verifySessionToken: (token) => verify(token, config.session),
  };
};

module.exports = {
  burnLaunchToken,
  secondsRemaining,
  recordingPreviewTokens: previewTokensFor("recording"),
  lessonPreviewTokens: previewTokensFor("lesson"),
};
