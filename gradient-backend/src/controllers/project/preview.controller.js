import db from "../../database/postgres/models/index.js";
const { Project } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  burnLaunchToken,
  projectPreviewTokens,
  secondsRemaining,
} from "../../util/previewToken.util.js";

const { generateLaunchToken, generateSessionToken, verifyLaunchToken } =
  projectPreviewTokens;

/**
 * The two ends of the project preview handshake — the same shape as
 * `recording/preview.controller.js`, over a different key.
 *
 *   mint    admin-only. Hands the panel a launch token for one project.
 *   verify  public, but useless without a launch token. Burns it and returns
 *           the session token the public site puts in its httpOnly cookie.
 *
 * What a project preview token unlocks is the two guide reads —
 * `GET /projects/public/slug/:slug` and `.../steps/:stepSlug` — and there it
 * lifts three things: the publish/review scope on the project, the publish flag
 * on its steps, and the guide gate. An admin checking a guide before it goes
 * out needs to read every step, drafts included, without filling in the form
 * themselves and writing a lead row for a project nobody can reach yet.
 */

/**
 * `exp` off a token this process just signed, so the cookie's `maxAge` can be
 * set from the token's own life rather than from a second copy of the TTL.
 */
const expiresInSeconds = (token) => {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
  );

  return secondsRemaining(payload);
};

/** POST /projects/admin/projects/:id/preview-token — adminAuth */
export const createProjectPreviewToken = asyncWrapper(async (req, res) => {
  const project = await Project.findByPk(req.params.id, {
    attributes: ["id", "slug", "title"],
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  const token = generateLaunchToken({
    resourceId: project.id,
    slug: project.slug,
    adminId: req.admin?.id ?? req.admin?.adminId ?? null,
  });

  return res.status(201).json({
    success: true,
    data: {
      token,
      slug: project.slug,
    },
  });
});

/** POST /projects/preview/verify — public, single-use */
export const verifyProjectPreviewSession = asyncWrapper(async (req, res) => {
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

  // Single use — see the recording controller for why a second redemption is
  // treated as a replay rather than a double-click.
  if (!(await burnLaunchToken(decoded))) {
    return res.status(401).json({
      success: false,
      message: "This preview link has already been used",
    });
  }

  // Re-read the slug rather than trusting the token's copy of it: an admin can
  // rename a project between minting the link and opening it.
  const project = await Project.findByPk(decoded.resourceId, {
    attributes: ["id", "slug", "title"],
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  const sessionToken = generateSessionToken({
    resourceId: project.id,
    slug: project.slug,
    adminId: decoded.adminId,
  });

  return res.status(200).json({
    success: true,
    data: {
      projectId: project.id,
      slug: project.slug,
      title: project.title,
      sessionToken,
      expiresIn: expiresInSeconds(sessionToken),
    },
  });
});
