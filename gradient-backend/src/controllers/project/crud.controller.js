import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { buildChanges, snapshot } from "../../util/helpers/activityDiff.js";
import { isPublicHttpUrl } from "../../util/helpers/url.js";
import {
  PROJECT_RELATED_LIMIT,
  PROJECT_SOURCE,
  PROJECT_STATUS,
} from "../../config/constants/project.js";

const { Project, ProjectCategory, ProjectLead, ProjectStep } = db;

const CATEGORY_ATTRS = ["id", "name", "slug"];

/** Everything the admin list needs to draw a row, and nothing more. */
/**
 * What the admin list selects.
 *
 * The last three are here for the submissions queue, which renders "Submitted
 * by", the write-up link and the rejection reason straight off a list row. They
 * were missing, so that whole block rendered blank — the queue looked like it
 * had no contact details for anybody, on every submission it had ever received.
 *
 * Safe to select here and nowhere near the public list: this endpoint is behind
 * `adminAuth`, and `public.controller.js` keeps its own `CARD_ATTRS` that has
 * never included any of them.
 */
const LIST_ATTRS = [
  "id",
  "slug",
  "title",
  "summary",
  "level",
  "categoryId",
  "downloadUrl",
  "status",
  "source",
  "isPublished",
  "publishedAt",
  "downloadCount",
  "createdAt",
  "updatedAt",
  "submitter",
  "submittedGuideUrl",
  "rejectionReason",
];

/**
 * Sorts the admin list offers.
 *
 * Whitelisted rather than passed through: an `order` built from a query string
 * is a column name the caller chooses, and `sort=constructor` would otherwise
 * hand Sequelize the `Object` constructor and 500 the list. Anything
 * unrecognised falls back to `recent`.
 *
 * Downloads is deliberately absent — the count comes from a separate grouped
 * query below, so ordering by it would sort a page that was already chosen.
 * Sorting by something the page does not contain is worse than not offering it.
 */
const LIST_SORTS = {
  // Drafts have no publishedAt and would sink to the bottom of a plain sort —
  // the wrong end of the list for the rows an admin is still working on.
  recent: [
    ["publishedAt", "DESC NULLS FIRST"],
    ["createdAt", "DESC"],
  ],
  oldest: [["createdAt", "ASC"]],
  title: [["title", "ASC"]],
  submitted: [["createdAt", "DESC"]],
};

/**
 * How many people downloaded each of these projects.
 *
 * **People, not clicks.** `ProjectLeads` holds one row per (project, person) —
 * the unique index enforces it and no endpoint deletes one — so counting rows
 * counts distinct downloaders. Somebody who comes back for the link four times
 * across two laptops is one.
 *
 * That makes this the only download number the panel shows. `downloadCount` on
 * the row is not it: that counts gate passes and carries repeat-visitor
 * inflation, exactly as `Recording.viewCount` does. It is kept as the raw
 * record and rendered nowhere.
 *
 * One grouped query for the whole page rather than a subquery per row — the
 * list is the screen an admin leaves open, and N+1 here is what makes it feel
 * slow.
 */
const resolveLeadCounts = async (projectIds) => {
  if (!projectIds.length) return {};

  const rows = await ProjectLead.findAll({
    attributes: [
      "projectId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    where: { projectId: { [Op.in]: projectIds } },
    group: ["projectId"],
    raw: true,
  });

  return Object.fromEntries(rows.map((r) => [r.projectId, Number(r.count)]));
};

/** Published-step counts, so the list can warn about a project with no guide. */
const resolveStepCounts = async (projectIds) => {
  if (!projectIds.length) return {};

  const rows = await ProjectStep.findAll({
    attributes: [
      "projectId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    where: { projectId: { [Op.in]: projectIds } },
    group: ["projectId"],
    raw: true,
  });

  return Object.fromEntries(rows.map((r) => [r.projectId, Number(r.count)]));
};

export const listProjects = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { q, categoryId, level, status, source, isPublished, sort } = req.query;

  const where = {};

  if (categoryId) where.categoryId = categoryId;
  if (level) where.level = level;
  if (status) where.status = status;
  if (source) where.source = source;
  if (isPublished === "true") where.isPublished = true;
  if (isPublished === "false") where.isPublished = false;

  if (q) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${q}%` } },
      { summary: { [Op.iLike]: `%${q}%` } },
      { slug: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const { rows, count } = await Project.findAndCountAll({
    where,
    attributes: LIST_ATTRS,
    include: [
      { model: ProjectCategory, as: "category", attributes: CATEGORY_ATTRS },
    ],
    // hasOwn, not a bare lookup — see LIST_SORTS.
    order: Object.hasOwn(LIST_SORTS, sort ?? "")
      ? LIST_SORTS[sort]
      : LIST_SORTS.recent,
    limit,
    offset,
    distinct: true,
  });

  const ids = rows.map((r) => r.id);
  const [leadCounts, stepCounts] = await Promise.all([
    resolveLeadCounts(ids),
    resolveStepCounts(ids),
  ]);

  return res.status(200).json({
    success: true,
    data: rows.map((row) => ({
      ...row.toJSON(),
      leadCount: leadCounts[row.id] ?? 0,
      stepCount: stepCounts[row.id] ?? 0,
    })),
    meta: getMeta(count, page, limit),
  });
});

export const getProjectById = asyncWrapper(async (req, res) => {
  const project = await Project.findByPk(req.params.id, {
    include: [
      { model: ProjectCategory, as: "category", attributes: CATEGORY_ATTRS },
    ],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  // The same counts as the list, by the same code path, so the two screens
  // cannot disagree about a number an admin will compare across them.
  const [leadCounts, stepCounts] = await Promise.all([
    resolveLeadCounts([project.id]),
    resolveStepCounts([project.id]),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      ...project.toJSON(),
      leadCount: leadCounts[project.id] ?? 0,
      stepCount: stepCounts[project.id] ?? 0,
    },
  });
});

export const checkSlugAvailability = asyncWrapper(async (req, res) => {
  const { slug, excludeId } = req.query;

  if (!slug) {
    return res.status(400).json({ success: false, message: "slug is required" });
  }

  const where = { slug };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const existing = await Project.findOne({ where, attributes: ["id"] });

  return res.status(200).json({ success: true, data: { available: !existing } });
});

/**
 * Fields a client may set.
 *
 * `downloadCount`, `status`, `source`, `submitter`, `reviewedAt`,
 * `reviewedByAdminId` and `rejectionReason` are all deliberately absent — the
 * first is a counter the gate owns, and the rest belong to the review
 * controller, which is the only writer of the moderation state. Without that
 * split a general update could smuggle an approval through by posting
 * `status: "approved"`.
 */
const pickWritable = (body) => ({
  slug: body.slug,
  title: body.title,
  summary: body.summary,
  categoryId: body.categoryId,
  level: body.level,
  downloadUrl: body.downloadUrl,
  thumbnail: body.thumbnail,
  scheduledAt: body.scheduledAt,
});

const withoutUndefined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const mergeBlock = (existing, incoming) => {
  if (incoming === undefined) return existing;
  if (incoming === null) return {};

  return { ...(existing ?? {}), ...incoming };
};

/** Arrays replace wholesale — merging two lists by index is never an edit. */
const normaliseList = (value) =>
  Array.isArray(value)
    ? [...new Set(value.map((v) => String(v).trim()).filter(Boolean))]
    : undefined;

/** Trims the manual "more like this" picks to what the rail can show. */
const normaliseRelated = (ids, selfId) => {
  if (!Array.isArray(ids)) return undefined;

  return [...new Set(ids.filter(Boolean))]
    .filter((id) => id !== selfId)
    .slice(0, PROJECT_RELATED_LIMIT);
};

export const createProject = asyncWrapper(async (req, res) => {
  const { title, categoryId } = req.body;

  if (!title) {
    return res
      .status(400)
      .json({ success: false, message: "Title is required" });
  }

  /**
   * Category is required at creation, though the column stays nullable.
   *
   * The two are not in conflict: deleting a category is `ON DELETE SET NULL`,
   * so an existing project can legitimately end up uncategorised and must still
   * load. What must not happen is a *new* project being filed nowhere — the
   * tile grid is the only way anybody browses this section, so an uncategorised
   * project is one nobody will find.
   */
  if (!categoryId) {
    return res
      .status(400)
      .json({ success: false, message: "Category is required" });
  }

  const category = await ProjectCategory.findByPk(categoryId, {
    attributes: ["id"],
  });

  if (!category) {
    return res
      .status(400)
      .json({ success: false, message: "That category does not exist" });
  }

  const project = await Project.create({
    ...withoutUndefined(pickWritable(req.body)),
    title,
    prerequisites: normaliseList(req.body.prerequisites) ?? [],
    skills: normaliseList(req.body.skills) ?? [],
    relatedProjectIds: normaliseRelated(req.body.relatedProjectIds) ?? [],
    seo: req.body.seo ?? {},
    settings: req.body.settings ?? {},
    // An admin-created project is already reviewed — it is the admin doing the
    // reviewing. It still starts unpublished, like every other content type.
    status: PROJECT_STATUS.APPROVED,
    source: PROJECT_SOURCE.ADMIN,
  });

  return res.status(201).json({ success: true, data: project });
});

/** The columns worth a field-level diff on the activity feed. */
const DIFF_FIELDS = [
  "title",
  "slug",
  "categoryId",
  "level",
  "summary",
  "downloadUrl",
  "prerequisites",
  "skills",
  "settings",
];

export const updateProject = asyncWrapper(async (req, res) => {
  const project = await Project.findByPk(req.params.id);

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  if (req.body.categoryId) {
    const category = await ProjectCategory.findByPk(req.body.categoryId, {
      attributes: ["id"],
    });

    if (!category) {
      return res
        .status(400)
        .json({ success: false, message: "That category does not exist" });
    }
  }

  const updates = withoutUndefined({
    ...pickWritable(req.body),
    prerequisites: normaliseList(req.body.prerequisites),
    skills: normaliseList(req.body.skills),
    relatedProjectIds: normaliseRelated(req.body.relatedProjectIds, project.id),
    seo: mergeBlock(project.seo, req.body.seo),
    settings: mergeBlock(project.settings, req.body.settings),
  });

  const before = snapshot(project, DIFF_FIELDS);

  await project.update(updates);

  req.activity?.set({
    entityLabel: project.title,
    changes: buildChanges(before, snapshot(project, DIFF_FIELDS)),
  });

  return res.status(200).json({ success: true, data: project });
});

/**
 * Publish and unpublish.
 *
 * Four preconditions, all checked at the one moment the project becomes visible
 * rather than on every save — a draft is allowed to be incomplete.
 */
export const toggleProjectStatus = asyncWrapper(async (req, res) => {
  const project = await Project.findByPk(req.params.id);

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  const nextPublished = !project.isPublished;

  if (nextPublished) {
    // A submission that has not been approved is not ours to show, whatever
    // the publish toggle says. This is the half of `publishedProjectScope`
    // that a human could otherwise bypass from the panel.
    if (project.status !== PROJECT_STATUS.APPROVED) {
      return res.status(409).json({
        success: false,
        message:
          "Approve this submission before publishing it.",
      });
    }

    // The analogue of refusing a YouTube URL we cannot parse: a published
    // project with a null or malformed link looks fine in every list and is a
    // dead button in production.
    if (!isPublicHttpUrl(project.downloadUrl)) {
      return res.status(400).json({
        success: false,
        message:
          "Add a valid download link (http or https) before publishing this project.",
      });
    }

    if (!project.categoryId) {
      return res.status(400).json({
        success: false,
        message:
          "File this project under a category before publishing it — the category grid is the only way people browse.",
      });
    }

    // A guide with nothing in it publishes a sidebar with nothing in it.
    const publishedSteps = await ProjectStep.count({
      where: { projectId: project.id, isPublished: true },
    });

    if (!publishedSteps) {
      return res.status(400).json({
        success: false,
        message:
          "Publish at least one guide step before publishing this project.",
      });
    }
  }

  await project.update({
    isPublished: nextPublished,
    // Stamped on first publish only. Re-publishing something that was pulled
    // down must not move it back to the top of the grid as though it were new.
    publishedAt: project.publishedAt ?? (nextPublished ? new Date() : null),
  });

  req.activity?.set({ entityLabel: project.title });

  return res.status(200).json({
    success: true,
    data: project,
    isPublished: project.isPublished,
  });
});

export const deleteProject = asyncWrapper(async (req, res) => {
  const project = await Project.findByPk(req.params.id);

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  // Captured before the row goes — the activity log's automatic lookup cannot
  // run once it is gone.
  req.activity?.set({ entityLabel: project.title });

  // Steps cascade with the project; leads do too, and that is the one worth
  // noticing. A lead is a person, so deleting a converted project throws away
  // the record that they downloaded it. Refused below rather than silently
  // done.
  const leadCount = await ProjectLead.count({ where: { projectId: project.id } });

  if (leadCount > 0) {
    return res.status(409).json({
      success: false,
      message: `This project has ${leadCount} download${leadCount === 1 ? "" : "s"} against it. Unpublish it instead — deleting would take those leads with it.`,
    });
  }

  await project.destroy();

  return res
    .status(200)
    .json({ success: true, message: "Project deleted successfully" });
});
