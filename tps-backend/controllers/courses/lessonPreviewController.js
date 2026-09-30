const asyncWrapper = require("../../utils/asyncWrapper");
const {
  burnLaunchToken,
  lessonPreviewTokens,
  secondsRemaining,
} = require("../../utils/previewToken");
const {
  Course,
  CourseModule,
  CourseModuleLesson,
} = require("../../models");

const { generateLaunchToken, generateSessionToken, verifyLaunchToken } =
  lessonPreviewTokens;

/**
 * The two ends of the free-course lesson preview handshake. Mirrors
 * `controllers/recording/previewController.js` — see the notes there for why
 * mint is staff-only and verify is not.
 *
 * What a lesson preview token unlocks is one endpoint —
 * `GET /courses/:courseSlug/modules/:moduleSlug/lessons/:lessonSlug` — where it
 * lifts the published filters on the lesson and its module. That is the whole
 * point: a lesson being written is a draft inside a module that is usually also
 * a draft, so there is otherwise no way at all to read it the way a learner
 * will. The public page's enrolment gate is lifted separately, on the site.
 */

/**
 * `exp` off a token this process just signed, so the cookie's `maxAge` can come
 * from the token's own life rather than a second copy of the TTL constant.
 */
const expiresInSeconds = (token) => {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8")
  );

  return secondsRemaining(payload);
};

/**
 * The lesson plus the slugs of the module and course above it — the full path
 * the public site serves it at, which is also the token's scope.
 */
const loadLessonPath = (id) =>
  CourseModuleLesson.findByPk(id, {
    attributes: ["id", "slug", "title"],
    include: [
      {
        model: CourseModule,
        as: "module",
        required: true,
        attributes: ["id", "slug"],
        include: [
          {
            model: Course,
            as: "course",
            required: true,
            attributes: ["id", "slug"],
          },
        ],
      },
    ],
  });

/** POST /courses/admin/lessons/:id/preview-token — requireStaff */
const createLessonPreviewToken = asyncWrapper(async (req, res) => {
  const lesson = await loadLessonPath(req.params.id);

  if (!lesson) {
    return res.status(404).json({ success: false, message: "Lesson not found" });
  }

  const moduleSlug = lesson.module.slug;
  const courseSlug = lesson.module.course.slug;

  const token = generateLaunchToken({
    resourceId: lesson.id,
    slug: lesson.slug,
    staffId: req.staff?.id ?? null,
    scope: { moduleSlug, courseSlug },
  });

  return res.status(201).json({
    success: true,
    data: { token, slug: lesson.slug, moduleSlug, courseSlug },
  });
});

/** POST /courses/preview/verify — public, single-use */
const verifyLessonPreviewSession = asyncWrapper(async (req, res) => {
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
  // more likely to be somebody replaying a link than a double-click.
  if (!(await burnLaunchToken(decoded))) {
    return res.status(401).json({
      success: false,
      message: "This preview link has already been used",
    });
  }

  // Re-read the slugs rather than trusting the token's copy: a lesson, module
  // or course can be renamed between minting the link and opening it, and the
  // redirect the site is about to make has to match where it actually lives.
  const lesson = await loadLessonPath(decoded.resourceId);

  if (!lesson) {
    return res.status(404).json({ success: false, message: "Lesson not found" });
  }

  const moduleSlug = lesson.module.slug;
  const courseSlug = lesson.module.course.slug;

  const sessionToken = generateSessionToken({
    resourceId: lesson.id,
    slug: lesson.slug,
    staffId: decoded.staffId,
    scope: { moduleSlug, courseSlug },
  });

  return res.status(200).json({
    success: true,
    data: {
      lessonId: lesson.id,
      slug: lesson.slug,
      moduleSlug,
      courseSlug,
      title: lesson.title,
      sessionToken,
      expiresIn: expiresInSeconds(sessionToken),
    },
  });
});

module.exports = {
  createLessonPreviewToken,
  verifyLessonPreviewSession,
};
