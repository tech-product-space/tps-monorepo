import { Op } from "sequelize";
import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import toSlug from "../../util/helpers/slugHelpers.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import {
  DEFAULT_COURSE_PRICING,
  DEFAULT_COURSE_SETTINGS,
} from "../../config/constants/course.js";
import {
  buildBrochureLink,
  resolveStorageUrl,
} from "../../util/helpers/courseLinks.js";
import { buildChanges, snapshot } from "../../util/helpers/activityDiff.js";
import { sanitisePricingInput } from "../../util/helpers/coursePricing.js";

const { Course, Lead } = db;

export const createCourse = asyncWrapper(async (req, res) => {
  const { name, slug } = req.body;

  if (!name || !slug) {
    return res.status(400).json({
      success: false,
      message: "name and slug are required",
    });
  }

  const normalisedSlug = toSlug(slug);

  const existing = await Course.findOne({
    where: { slug: { [Op.iLike]: normalisedSlug } },
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: "A course with this slug already exists",
    });
  }

  const course = await Course.create({
    name,
    slug: normalisedSlug,
    pricing: DEFAULT_COURSE_PRICING,
    settings: DEFAULT_COURSE_SETTINGS,
    brochure: {},
  });

  return res.status(201).json({
    success: true,
    data: course,
  });
});

export const getAllCourses = asyncWrapper(async (req, res) => {
  const courses = await Course.findAll({
    order: [["createdAt", "DESC"]],
  });

  // One grouped query rather than a count per row, so the list stays a
  // constant two queries however many courses exist.
  const leadCounts = await Lead.findAll({
    attributes: [
      "courseId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    where: { courseId: { [Op.ne]: null } },
    group: ["courseId"],
    raw: true,
  });

  const countByCourse = new Map(
    leadCounts.map((row) => [row.courseId, Number(row.count)]),
  );

  return res.status(200).json({
    success: true,
    data: courses.map((course) => ({
      ...course.toJSON(),
      leadCount: countByCourse.get(course.id) || 0,
    })),
  });
});

export const getCourseById = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      ...course.toJSON(),
      // The pasteable link and the direct file both come back so the admin can
      // copy one into a template and open the other to check the upload.
      brochureLink: buildBrochureLink(req, course.slug),
      brochureFileUrl: resolveStorageUrl(course.brochure?.fileKey),
    },
  });
});

/**
 * Partial update. `slug` is intentionally not updatable — the live page URL and
 * every lead's `source` are keyed off it.
 */
export const updateCourse = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { name, pricing, settings, brochure, isPublished } = req.body;

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const updates = {};

  if (name !== undefined) updates.name = name;
  if (isPublished !== undefined) updates.isPublished = isPublished;

  // Each JSONB block is merged rather than replaced, so a screen that only
  // knows about pricing cannot wipe fields another screen owns.
  if (pricing !== undefined) {
    // Rejected here rather than clamped on the way out: a seat count that is
    // not a number is a mistake worth telling the admin about, not something
    // to quietly drop from the page.
    const { error, value } = sanitisePricingInput(pricing);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    updates.pricing = { ...course.pricing, ...value };
  }

  if (settings !== undefined) {
    updates.settings = { ...course.settings, ...settings };
  }

  if (brochure !== undefined) {
    updates.brochure = { ...course.brochure, ...brochure };
  }

  // Snapshot before the write so the log can show "earlyBirdPrice 14999 → 12999"
  // instead of just "pricing changed". buildChanges recurses one level, which is
  // what makes these JSONB blocks readable.
  const before = snapshot(course, [
    "name",
    "isPublished",
    "pricing",
    "settings",
    "brochure",
  ]);

  await course.update(updates);

  req.activity?.set({
    entityLabel: course.name,
    changes: buildChanges(before, snapshot(course, Object.keys(before))),
  });

  return res.status(200).json({
    success: true,
    data: course,
  });
});

export const toggleCourseStatus = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const isPublished = !course.isPublished;

  await course.update({ isPublished });

  req.activity?.set({ entityLabel: course.name });

  return res.status(200).json({
    success: true,
    message: `Course ${isPublished ? "published" : "moved to draft"} successfully`,
    data: { id: course.id, isPublished },
  });
});

export const deleteCourse = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const leadCount = await Lead.count({ where: { courseId: id } });

  if (leadCount > 0) {
    return res.status(409).json({
      success: false,
      message: `This course has ${leadCount} lead(s). Unpublish it instead of deleting.`,
    });
  }

  // Captured before the row is gone, or the log would show a bare id.
  req.activity?.set({ entityLabel: course.name });

  await course.destroy();

  return res.status(200).json({
    success: true,
    message: "Course deleted successfully",
  });
});

/**
 * Records the brochure the admin just uploaded through /upload/admin/course/upload.
 */
export const updateBrochure = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { fileKey, fileName } = req.body;

  if (!fileKey) {
    return res.status(400).json({
      success: false,
      message: "fileKey is required",
    });
  }

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  await course.update({
    brochure: {
      fileKey,
      fileName: fileName || fileKey.split("/").pop(),
      uploadedAt: new Date().toISOString(),
    },
  });

  req.activity?.set({
    entityLabel: course.name,
    metadata: { fileName: course.brochure.fileName },
  });

  return res.status(200).json({
    success: true,
    data: {
      brochure: course.brochure,
      brochureLink: buildBrochureLink(req, course.slug),
      brochureFileUrl: resolveStorageUrl(course.brochure.fileKey),
    },
  });
});

export const removeBrochure = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  // Removing the file also removes the site's download button, since that is
  // driven by whether a brochure exists.
  await course.update({ brochure: {} });

  return res.status(200).json({
    success: true,
    message: "Brochure removed",
  });
});

export const listCourseLeads = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { page, limit, offset } = getPaginationParams(req.query);
  const { subSource, search } = req.query;

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const where = { courseId: id };

  if (subSource) where.subSource = subSource;

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Lead.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});
