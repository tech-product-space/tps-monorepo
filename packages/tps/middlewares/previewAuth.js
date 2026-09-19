const {
  recordingPreviewTokens,
  lessonPreviewTokens,
} = require("../utils/previewToken");

const VERIFIERS = {
  recording: recordingPreviewTokens.verifySessionToken,
  lesson: lessonPreviewTokens.verifySessionToken,
};

/**
 * How each kind's token is matched against the route it was presented to.
 *
 * A recording is one page at one slug, so its slug is the whole scope. A lesson
 * is not: the same lesson slug can exist in another module, and the same module
 * slug in another course, so all three segments are compared. Missing an
 * intermediate one would let a token minted for a draft lesson open a
 * same-named lesson somewhere the author has no business reading.
 */
const SCOPES = {
  recording: (decoded, params) => decoded.slug === params.slug,
  lesson: (decoded, params) =>
    decoded.slug === params.lessonSlug &&
    decoded.moduleSlug === params.moduleSlug &&
    decoded.courseSlug === params.courseSlug,
};

/**
 * Attaches `req.preview` when a valid, in-scope preview session token is
 * present, and simply carries on when it is not.
 *
 * Optional by design, like `optionalUser`. Every route this guards is a public
 * one that a visitor with no token must keep reaching exactly as before — so a
 * missing, malformed, expired or out-of-scope token means "you are the public",
 * never a 401. Rejecting here would turn a stale staff cookie into a broken
 * page for a real visitor.
 *
 * `kind` picks the signing key, so another kind's session token is not merely
 * refused here — it does not verify against this route at all.
 *
 * The kind also decides how the token is matched against the route — see
 * `SCOPES`. Whatever the shape, it is checked against the token's own claims, so
 * a token minted for one row cannot read another's drafts.
 */
const previewAuth = (kind) => {
  const verifySessionToken = VERIFIERS[kind];
  const inScope = SCOPES[kind];

  if (!verifySessionToken || !inScope)
    throw new Error(`Unknown preview kind: ${kind}`);

  return (req, res, next) => {
    const token = req.headers["x-preview-token"];

    if (!token || typeof token !== "string") return next();

    let decoded;

    try {
      decoded = verifySessionToken(token);
    } catch {
      return next();
    }

    if (!inScope(decoded, req.params)) return next();

    req.preview = {
      kind,
      resourceId: decoded.resourceId,
      slug: decoded.slug,
      staffId: decoded.staffId,
    };

    next();
  };
};

module.exports = previewAuth;
