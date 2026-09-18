import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { verifyProjectUnlock } from "../../util/projectUnlock.util.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import {
  isGuideStepGated,
  projectUnlockCookieName,
  publishedProjectScope,
  resolveProjectSettings,
} from "../../config/constants/project.js";

const { Project, ProjectCategory, ProjectStep } = db;

/**
 * The public face of /projects.
 *
 * **`downloadUrl` does not leave this file while a project is gated.** It is
 * emitted by `lead.controller.js` and nowhere else. A GitHub link is not a
 * secret and nobody is pretending otherwise — but shipping it in the page
 * payload and letting the frontend hide the button puts it in view-source and
 * makes the download number the section is measured on fiction.
 *
 * Anything new that returns a project from here must strip it the same way.
 * `presentProject` below is the one place that happens; use it rather than
 * spreading a row into a response by hand.
 */

/**
 * Strips what the public may not see, and says what the card needs instead.
 *
 * `isGated` is the contract with the frontend: true means "open the form
 * dialog, the link arrives in the gate response"; false means `downloadUrl` is
 * populated and the button is a plain anchor.
 */
const presentProject = (project, { includeDownloadUrl = false } = {}) => {
  const settings = resolveProjectSettings(project);
  const json = typeof project.toJSON === "function" ? project.toJSON() : project;

  const gated = settings.gateDownload;

  return {
    ...json,
    settings,
    isGated: gated,
    // An ungated project's link ships with the payload — that switch means
    // "downloads for anybody" and the gate endpoint is not on the path to one.
    downloadUrl: gated && !includeDownloadUrl ? null : json.downloadUrl,
  };
};

const CARD_ATTRS = [
  "id",
  "slug",
  "title",
  "summary",
  "level",
  "categoryId",
  "prerequisites",
  "skills",
  "downloadUrl",
  "settings",
  "source",
  "publishedAt",
];

export const listPublicCategories = asyncWrapper(async (req, res) => {
  const categories = await ProjectCategory.findAll({
    where: { isActive: true },
    attributes: ["id", "name", "slug", "thumbnail", "description", "order"],
    order: [
      ["order", "ASC"],
      ["name", "ASC"],
    ],
  });

  // Counts only what the public can actually reach, unlike the admin list —
  // a tile reading "12 projects" that opens onto three is worse than no count.
  const counts = await Project.findAll({
    attributes: [
      "categoryId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    where: {
      ...publishedProjectScope(),
      categoryId: { [Op.in]: categories.map((c) => c.id) },
    },
    group: ["categoryId"],
    raw: true,
  });

  const countByCategory = Object.fromEntries(
    counts.map((r) => [r.categoryId, Number(r.count)]),
  );

  return res.status(200).json({
    success: true,
    data: categories.map((category) => ({
      ...category.toJSON(),
      projectCount: countByCategory[category.id] ?? 0,
    })),
  });
});

export const listPublicProjects = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { category, level, q } = req.query;

  const where = { ...publishedProjectScope() };

  if (level) where.level = level;

  if (category) {
    const found = await ProjectCategory.findOne({
      where: { slug: category },
      attributes: ["id"],
    });

    // An unknown category slug is an empty list, not every project. Falling
    // back to "everything" would quietly answer a different question than the
    // URL asked.
    if (!found) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: getMeta(0, page, limit),
      });
    }

    where.categoryId = found.id;
  }

  if (q) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${q}%` } },
      { summary: { [Op.iLike]: `%${q}%` } },
      { skills: { [Op.overlap]: [q] } },
    ];
  }

  const { rows, count } = await Project.findAndCountAll({
    where,
    attributes: CARD_ATTRS,
    include: [
      {
        model: ProjectCategory,
        as: "category",
        attributes: ["id", "name", "slug"],
      },
    ],
    order: [
      ["publishedAt", "DESC NULLS LAST"],
      ["createdAt", "DESC"],
    ],
    limit,
    offset,
    distinct: true,
  });

  /**
   * The first published step of each project, so a card can link straight into
   * the guide.
   *
   * One query for the whole page rather than one per card: the alternative is
   * twelve round trips to answer "where does this button go", and the answer is
   * the same shape for every row.
   */
  const firstSteps = await ProjectStep.findAll({
    where: { projectId: { [Op.in]: rows.map((row) => row.id) }, isPublished: true },
    attributes: ["projectId", "slug", "order", "createdAt"],
    order: [
      ["order", "ASC"],
      ["createdAt", "ASC"],
    ],
    raw: true,
  });

  const firstByProject = {};
  for (const step of firstSteps) {
    if (!firstByProject[step.projectId]) firstByProject[step.projectId] = step.slug;
  }

  return res.status(200).json({
    success: true,
    data: rows.map((row) => ({
      ...presentProject(row),
      // Absent when a project somehow has no published step. The card falls
      // back to /projects/:slug, which redirects to wherever the guide starts.
      firstStepSlug: firstByProject[row.id] ?? null,
    })),
    meta: getMeta(count, page, limit),
  });
});

/**
 * The guide shell: header, plus the step list as titles only.
 *
 * Step bodies load one at a time from `getPublicStep`. Shipping every step's
 * ProseMirror document here would make a ten-step guide's first paint carry
 * nine steps nobody has opened yet.
 */
export const getPublicProjectBySlug = asyncWrapper(async (req, res) => {
  const where = { slug: req.params.slug };

  // `previewAuth` sets `req.preview` for an admin holding a valid, in-scope
  // preview token, and for nobody else. Without one, a draft or an unreviewed
  // submission 404s exactly as it did before.
  const previewing = Boolean(req.preview);

  if (!previewing) Object.assign(where, publishedProjectScope());

  const project = await Project.findOne({
    where,
    include: [
      {
        model: ProjectCategory,
        as: "category",
        attributes: ["id", "name", "slug", "thumbnail"],
      },
    ],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  const steps = await ProjectStep.findAll({
    where: {
      projectId: project.id,
      // A preview shows drafts; the public does not.
      ...(previewing ? {} : { isPublished: true }),
    },
    attributes: ["id", "title", "slug", "order", "isPublished"],
    order: [
      ["order", "ASC"],
      ["createdAt", "ASC"],
    ],
  });

  const settings = resolveProjectSettings(project);

  /**
   * Which steps sit behind the gate, marked here so the rail can draw a lock
   * without re-deriving the rule. Whether *this* reader is past it is a
   * different question, and not one a server render can answer — the site's
   * cookie is on the API's host, so the step's own fetch is what settles it.
   */
  const gatedSteps = steps.map((step, index) => ({
    ...step.toJSON(),
    isGated: isGuideStepGated(settings, index),
  }));

  return res.status(200).json({
    success: true,
    data: {
      // In preview the download link goes out even when gated — "does the
      // button point at the right place" is one of the things an admin opens a
      // preview to answer, and they are already authenticated to see it.
      ...presentProject(project, { includeDownloadUrl: previewing }),
      steps: gatedSteps,
    },
  });
});

/**
 * How much of a locked step is sent as a teaser.
 *
 * The page blurs this behind the gate, so it has to be real writing — enough to
 * show the step is worth an email — and it has to be **short**. Whatever is
 * sent is readable in dev tools no matter how it is styled: blur is a visual
 * effect, not a security boundary. Three blocks is a paragraph or two.
 */
const LOCKED_PREVIEW_BLOCKS = 3;

const previewOf = (content) => {
  const blocks = content?.content;

  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  return {
    type: "doc",
    content: blocks.slice(0, LOCKED_PREVIEW_BLOCKS),
  };
};

/**
 * One step's document — and the one place the guide gate is enforced.
 *
 * A locked step comes back with **a preview, never the body**. The page shows
 * that preview blurred under the form, which is the whole point: somebody can
 * see what they are being asked for. Sending the rest and hiding it in CSS
 * would make the gate decorative and the numbers fiction.
 *
 * 200 rather than 403: "this step is locked" is a normal answer to a normal
 * request, and the page renders the form in place of the body. A 403 would put
 * an error in every console for something that is working as designed.
 */
export const getPublicStep = asyncWrapper(async (req, res) => {
  const where = { slug: req.params.slug };
  if (!req.preview) Object.assign(where, publishedProjectScope());

  const project = await Project.findOne({
    where,
    attributes: ["id", "settings"],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  const step = await ProjectStep.findOne({
    where: {
      projectId: project.id,
      slug: req.params.stepSlug,
      ...(req.preview ? {} : { isPublished: true }),
    },
  });

  if (!step) {
    return res.status(404).json({ success: false, message: "Step not found" });
  }

  const settings = resolveProjectSettings(project);

  /**
   * The step's position in the *published* guide, not its `order` column.
   *
   * `order` has gaps — a step deleted or unpublished leaves one — so counting
   * on it would put the gate in a different place than the reader's own list
   * shows, which is the kind of bug nobody can reproduce.
   */
  const published = await ProjectStep.findAll({
    where: { projectId: project.id, ...(req.preview ? {} : { isPublished: true }) },
    attributes: ["id"],
    order: [
      ["order", "ASC"],
      ["createdAt", "ASC"],
    ],
  });

  const index = published.findIndex((row) => row.id === step.id);

  // An admin previewing their own guide reads it whole; they are already
  // authenticated and "does this step read right" is what preview is for.
  const unlocked =
    Boolean(req.preview) ||
    Boolean(
      verifyProjectUnlock(
        req.cookies?.[projectUnlockCookieName(project.id)],
        project.id,
      ),
    );

  if (isGuideStepGated(settings, index) && !unlocked) {
    return res.status(200).json({
      success: true,
      locked: true,
      data: {
        id: step.id,
        projectId: step.projectId,
        title: step.title,
        slug: step.slug,
        order: step.order,
        isPublished: step.isPublished,
        content: null,
        // The teaser, and the only part of a locked step that leaves here.
        preview: previewOf(step.content),
      },
    });
  }

  return res.status(200).json({ success: true, locked: false, data: step });
});

