import db from "../../database/postgres/models/index.js";
const { FreeCourse } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  burnLaunchToken,
  freeCoursePreviewTokens,
  secondsRemaining,
} from "../../util/previewToken.util.js";

const { generateLaunchToken, generateSessionToken, verifyLaunchToken } =
  freeCoursePreviewTokens;

/**
 * The two ends of the preview handshake. `FREE_COURSE_PREVIEW_PLAN.md` §4.4.
 *
 *   mint    admin-only. Hands the panel a launch token for one course.
 *   verify  public, but useless without a launch token. Burns it and returns
 *           the session token the public site puts in its httpOnly cookie.
 *
 * Verify is public because the caller is the marketing site's route handler,
 * which has no admin credentials and no copy of the signing key. The launch
 * token is the credential, which is why it is spent on first use.
 */

/**
 * `exp` off a token this process just signed, so the cookie's `maxAge` can be
 * set from the token's own life rather than from a second copy of the TTL
 * constant that would drift away from it.
 */
const expiresInSeconds = (token) => {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
  );

  return secondsRemaining(payload);
};

/** POST /free-courses/:id/preview-token — adminAuth */
export const createPreviewToken = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await FreeCourse.findByPk(id, {
    attributes: ["id", "slug", "title"],
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  const token = generateLaunchToken({
    resourceId: course.id,
    slug: course.slug,
    adminId: req.admin?.id ?? req.admin?.adminId ?? null,
  });

  return res.status(201).json({
    success: true,
    data: {
      token,
      slug: course.slug,
    },
  });
});

/** POST /free-courses/preview/verify — public, single-use */
export const verifyPreviewSession = asyncWrapper(async (req, res) => {
  const { token } = req.body ?? {};

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Preview token is required",
    });
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
  // more likely to be someone replaying a link than the admin double-clicking,
  // and the admin's own session is already established by then anyway.
  if (!(await burnLaunchToken(decoded))) {
    return res.status(401).json({
      success: false,
      message: "This preview link has already been used",
    });
  }

  // Re-read the slug rather than trusting the token's copy of it: an admin can
  // rename a course between minting the link and opening it, and the redirect
  // the site is about to make has to match where the course actually lives.
  const course = await FreeCourse.findByPk(decoded.resourceId, {
    attributes: ["id", "slug", "title"],
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  const sessionToken = generateSessionToken({
    resourceId: course.id,
    slug: course.slug,
    adminId: decoded.adminId,
  });

  return res.status(200).json({
    success: true,
    data: {
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      sessionToken,
      expiresIn: expiresInSeconds(sessionToken),
    },
  });
});
