import {
  freeCoursePreviewTokens,
  projectPreviewTokens,
  recordingPreviewTokens,
} from "../util/previewToken.util.js";

const VERIFIERS = {
  freeCourse: freeCoursePreviewTokens.verifySessionToken,
  recording: recordingPreviewTokens.verifySessionToken,
  project: projectPreviewTokens.verifySessionToken,
};

/**
 * Attaches `req.preview` when a valid, in-scope preview session token is
 * present, and simply carries on when it is not.
 *
 * Optional by design, like `optionalAuthMiddleware`. Every route this guards is
 * a public one that a visitor with no token must keep reaching exactly as
 * before — so a missing, malformed, expired or out-of-scope token means "you
 * are the public", never a 401. Rejecting here would turn a stale admin cookie
 * into a broken page for a real learner.
 *
 * `kind` picks the signing key, so a recording's session token is not merely
 * refused by the free-course routes — it does not verify against them at all.
 *
 * `param` says which request parameter identifies the resource, because the
 * routes disagree: the slug ones carry a slug, the free-course module one
 * carries a course id. Whichever it is, it is checked against the token's own
 * claim, so a token minted for one row cannot read another's drafts.
 */
export const previewAuth = (kind, param) => {
  const verifySessionToken = VERIFIERS[kind];

  if (!verifySessionToken) throw new Error(`Unknown preview kind: ${kind}`);

  return (req, res, next) => {
    const token = req.headers["x-preview-token"];

    if (!token || typeof token !== "string") return next();

    let decoded;

    try {
      decoded = verifySessionToken(token);
    } catch {
      return next();
    }

    const matches =
      param === "id"
        ? decoded.resourceId === (req.params.courseId ?? req.params.id)
        : decoded.slug === (req.params.slug ?? req.params.courseSlug);

    if (!matches) return next();

    req.preview = {
      kind,
      resourceId: decoded.resourceId,
      slug: decoded.slug,
      adminId: decoded.adminId,
    };

    next();
  };
};
