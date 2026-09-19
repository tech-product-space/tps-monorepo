import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  publishedProjectScope,
  resolveProjectSettings,
} from "../../config/constants/project.js";

const { Project, ProjectStep, ProjectStepProgress } = db;

/**
 * The ticks and the resume point.
 *
 * **Both endpoints here take the user from `req.user`, never from the request
 * body.** The free-course equivalent
 * (`POST /free-courses/lesson/complete/:id`) reads `const { userId } =
 * req.body` and has no auth middleware on its route, so anybody can post
 * progress for anybody. Both of these sit behind `authMiddleware`, and neither
 * reads an id off the request.
 *
 * This is the only part of the projects section that needs an account. The
 * guide itself is fully public — it is the reason the download is worth
 * wanting, and hiding it behind a sign-up puts the sales pitch behind the
 * counter.
 */

export const getProjectProgress = asyncWrapper(async (req, res) => {
  const project = await Project.findOne({
    where: { slug: req.params.slug, ...publishedProjectScope() },
    attributes: ["id", "slug", "settings"],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  const settings = resolveProjectSettings(project);

  if (!settings.trackProgress) {
    return res.status(200).json({
      success: true,
      data: { trackProgress: false, completedStepIds: [], resumeStepSlug: null },
    });
  }

  const steps = await ProjectStep.findAll({
    where: { projectId: project.id, isPublished: true },
    attributes: ["id", "slug", "order"],
    order: [
      ["order", "ASC"],
      ["createdAt", "ASC"],
    ],
  });

  const progress = await ProjectStepProgress.findAll({
    where: {
      userId: req.user.id,
      projectStepId: steps.map((s) => s.id),
      completed: true,
    },
    attributes: ["projectStepId"],
  });

  const completed = new Set(progress.map((p) => p.projectStepId));

  // Resume at the first step they have *not* finished — not the last one they
  // did. Those differ the moment somebody skips ahead and comes back, and the
  // first gap is the one they still have to close.
  const resumeStep = steps.find((s) => !completed.has(s.id)) ?? null;

  return res.status(200).json({
    success: true,
    data: {
      trackProgress: true,
      completedStepIds: [...completed],
      totalSteps: steps.length,
      completedCount: completed.size,
      resumeStepSlug: resumeStep?.slug ?? null,
    },
  });
});

/**
 * Tick a step, or untick it.
 *
 * Idempotent: ticking something already ticked is a 200 that changes nothing,
 * because the sidebar fires this on scroll-to-end and a double-fire must not be
 * an error the reader sees.
 */
export const completeStep = asyncWrapper(async (req, res) => {
  const step = await ProjectStep.findByPk(req.params.id, {
    attributes: ["id", "projectId", "isPublished"],
  });

  if (!step || !step.isPublished) {
    return res.status(404).json({ success: false, message: "Step not found" });
  }

  // The step has to belong to a project the public can actually see, or a
  // draft's step ids become a way to accumulate progress against something
  // unpublished.
  const project = await Project.findOne({
    where: { id: step.projectId, ...publishedProjectScope() },
    attributes: ["id", "settings"],
  });

  if (!project) {
    return res.status(404).json({ success: false, message: "Step not found" });
  }

  if (!resolveProjectSettings(project).trackProgress) {
    return res.status(409).json({
      success: false,
      message: "This project does not track progress.",
    });
  }

  const completed = req.body.completed !== false;

  const [row] = await ProjectStepProgress.findOrCreate({
    // userId from the session. See the note at the top of this file.
    where: { userId: req.user.id, projectStepId: step.id },
    defaults: {
      userId: req.user.id,
      projectStepId: step.id,
      completed,
      completedAt: completed ? new Date() : null,
    },
  });

  if (row.completed !== completed) {
    await row.update({
      completed,
      completedAt: completed ? new Date() : null,
    });
  }

  return res.status(200).json({ success: true, data: row });
});
