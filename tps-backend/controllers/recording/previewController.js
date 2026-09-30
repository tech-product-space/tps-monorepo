const db = require("../../models");
const asyncWrapper = require("../../utils/asyncWrapper");
const {
  burnLaunchToken,
  recordingPreviewTokens,
  secondsRemaining,
} = require("../../utils/previewToken");

const { Recording } = db;

const { generateLaunchToken, generateSessionToken, verifyLaunchToken } =
  recordingPreviewTokens;

/**
 * The two ends of the recording preview handshake.
 *
 *   mint    staff-only. Hands the panel a launch token for one recording.
 *   verify  public, but useless without a launch token. Burns it and returns
 *           the session token the public site puts in its httpOnly cookie.
 *
 * Verify is public because the caller is the marketing site's own route
 * handler, which has no staff credentials and no copy of the signing key. The
 * launch token is the credential, which is why it is spent on first use.
 *
 * What a recording preview token unlocks is one endpoint —
 * `GET /recordings/public/slug/:slug` — and there it does two things: it lifts
 * the live predicate so a draft or a scheduled-ahead recording renders, and it
 * emits the video block the gate otherwise withholds. The second is the point.
 * Watching a gated recording on this site needs a website account and writes a
 * lead row, and neither is something to ask of somebody checking a recording
 * nobody can reach yet.
 */

/**
 * `exp` off a token this process just signed, so the cookie's `maxAge` can come
 * from the token's own life rather than from a second copy of the TTL constant
 * that would drift away from it.
 */
const expiresInSeconds = (token) => {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8")
  );

  return secondsRemaining(payload);
};

/** POST /recordings/admin/recordings/:id/preview-token — requireStaff */
const createRecordingPreviewToken = asyncWrapper(async (req, res) => {
  const recording = await Recording.findByPk(req.params.id, {
    attributes: ["id", "slug", "title"],
  });

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  const token = generateLaunchToken({
    resourceId: recording.id,
    slug: recording.slug,
    staffId: req.staff?.id ?? null,
  });

  return res.status(201).json({
    success: true,
    data: { token, slug: recording.slug },
  });
});

/** POST /recordings/preview/verify — public, single-use */
const verifyRecordingPreviewSession = asyncWrapper(async (req, res) => {
  const { token } = req.body ?? {};

  if (!token) {
    return res
      .status(400)
      .json({ success: false, message: "Preview token is required" });
  }

  let decoded;

  try {
    decoded = verifyLaunchToken(token);
  } catch {
    return res.status(401).json({
      success: false,
      message: "This preview link is invalid or has expired",
    });
  }

  // Single use. The token has been sitting in a URL, in browser history and in
  // a Referer header since it was minted; redeeming it a second time is far
  // more likely to be somebody replaying a link than a double-click, and the
  // session cookie is already established by then anyway.
  if (!(await burnLaunchToken(decoded))) {
    return res.status(401).json({
      success: false,
      message: "This preview link has already been used",
    });
  }

  // Re-read the slug rather than trusting the token's copy of it: a recording
  // can be renamed between minting the link and opening it, and the redirect
  // the site is about to make has to match where it actually lives.
  const recording = await Recording.findByPk(decoded.resourceId, {
    attributes: ["id", "slug", "title"],
  });

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  const sessionToken = generateSessionToken({
    resourceId: recording.id,
    slug: recording.slug,
    staffId: decoded.staffId,
  });

  return res.status(200).json({
    success: true,
    data: {
      recordingId: recording.id,
      slug: recording.slug,
      title: recording.title,
      sessionToken,
      expiresIn: expiresInSeconds(sessionToken),
    },
  });
});

module.exports = {
  createRecordingPreviewToken,
  verifyRecordingPreviewSession,
};
