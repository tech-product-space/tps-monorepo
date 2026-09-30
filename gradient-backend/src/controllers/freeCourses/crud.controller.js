import db from "../../database/postgres/models/index.js";
const { FreeCourse, FreeCourseModule, FreeCourseLesson ,FreeCourseLessonProgress} = db;

import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";


export const createFreeCourse = asyncWrapper(async (req, res) => {
  const {
    title,
    subTitle,
    description,
    slug,
  } = req.body;

  if (!title || !subTitle || !description || !slug) {
    return res.status(400).json({
      success: false,
      message: "Please enter all the details",
    });
  }

  const course = await FreeCourse.create({
    title,
    subTitle,
    description,
    slug
  });

  return res.status(201).json({
    success: true,
    data: course,
  });
});

export const getAllFreeCourses = asyncWrapper(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;

  const { search } = req.query;

  const where = {};

  if (search) {
    where.title = { [Op.iLike]: `%${search}%` };
  }

  const { rows, count } = await FreeCourse.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  return res.status(200).json({
    success: true,
    data: rows,
    meta: {
      total: count,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
});

export const getFreeCourseById = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await FreeCourse.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: course,
  });
});

export const updateFreeCourse = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await FreeCourse.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  await course.update(req.body);

  return res.status(200).json({
    success: true,
    data: course,
  });
});

export const toggleFreeCourseStatus = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await FreeCourse.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  const newStatus = !course.isPublished;

  await course.update({ isPublished: newStatus });

  return res.status(200).json({
    success: true,
    message: `Free course ${newStatus ? "published" : "moved to draft"
      } successfully`,
    data: {
      id: course.id,
      isPublished: newStatus,
    },
  });
});

export const checkFreeCourseSlugAvailability = asyncWrapper(
  async (req, res) => {
    const rawSlug = req.query.slug?.trim();

    if (!rawSlug) {
      return res.status(400).json({
        result: "ERROR",
        error: "Slug is required",
      });
    }

    const slug = rawSlug.toLowerCase().replace(/\s+/g, "-");

    const existing = await FreeCourse.findOne({
      where: {
        slug: { [Op.iLike]: slug },
      },
    });

    if (existing) {
      return res.status(200).json({
        result: "SUCCESS",
        available: false,
        slug,
        message: "Slug already taken",
      });
    }

    return res.status(200).json({
      result: "SUCCESS",
      available: true,
      slug,
      message: "Slug is available",
    });
  }
);

export const deleteFreeCourse = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await FreeCourse.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  // Captured before the row goes — the log's automatic label lookup cannot help
  // once the record is deleted.
  req.activity?.set({ entityLabel: course.title });

  await course.destroy();

  return res.status(200).json({
    success: true,
    message: "Free course deleted successfully",
  });
});


export const getAllPublishedFreeCourses = asyncWrapper(async (req, res) => {
  const courses = await FreeCourse.findAll({
    where: {
      isPublished: true,
    },
    attributes: [
      "title",
      "subTitle",
      "description",
      "author",
      "thumbnail",
      "rightCard",
      "slug",
      // The listing card shows a module count. rightCard["0"] holds the
      // admin-typed label and wins when set, but it is free text and often
      // left blank, so count the published modules here as the fallback.
      // A correlated subquery keeps this one query instead of one per course.
      [
        db.sequelize.literal(`(
          SELECT COUNT(*)::int
          FROM "FreeCourseModules" AS m
          WHERE m."freeCourseId" = "FreeCourse"."id"
            AND m."isPublished" = true
        )`),
        "moduleCount",
      ],
    ],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: courses,
  });
});

export const getCourseDetails = asyncWrapper(async (req, res) => {
  const { slug } = req.params;

  const course = await FreeCourse.findOne({
    where: { slug },
    attributes: { exclude: ["createdAt", "updatedAt"] },
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: course,
  });
});


export const getBasicCourseDetails = asyncWrapper(async (req, res) => {
  const { slug } = req.params;

  const course = await FreeCourse.findOne({
    where: { slug },
    attributes: ["id", "title", "slug"],
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: course,
  });
});


export const getFreeCourseStructureBySlug = asyncWrapper(
  async (req, res) => {
    const { slug } = req.params;

    // An admin holding an in-scope preview token sees the course as it will be,
    // drafts and all. Everyone else sees only what is published, exactly as
    // before. `previewAuth` has already checked the token covers *this* course.
    const previewing = Boolean(req.preview);
    const publishFilter = previewing ? {} : { isPublished: true };

    // The flag comes back only in preview, because it is the only context that
    // has anything to do with it — it is what the Draft chip renders from.
    const withFlag = (attributes) =>
      previewing ? [...attributes, "isPublished"] : attributes;

    const course = await FreeCourse.findOne({
      where: {
        slug,
        ...publishFilter,
      },

      attributes: withFlag([
        "id",
        "title",
        "slug",
      ]),

      include: [
        {
          model: FreeCourseModule,

          as: "modules",

          attributes: withFlag([
            "id",
            "title",
            "subTitle",
            "slug",
            "order",
          ]),

          where: {
            ...publishFilter,
          },

          required: false,

          include: [
            {
              model: FreeCourseLesson,

              as: "lessons",

              attributes: withFlag([
                "id",
                "title",
                "slug",
                "order",
              ]),

              where: {
                ...publishFilter,
              },

              required: false,
            },
          ],
        },
      ],

      order: [
        [
          { model: FreeCourseModule, as: "modules" },
          "order",
          "ASC",
        ],

        [
          { model: FreeCourseModule, as: "modules" },
          { model: FreeCourseLesson, as: "lessons" },
          "order",
          "ASC",
        ],
      ],
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: course,
    });
  }
);

export const getLessonBySlug = asyncWrapper(
  async (req, res) => {
    const { courseSlug, moduleSlug, lessonSlug } = req.params;

    // Three levels of publish gate, all lifted together for a preview. Lifting
    // fewer would be worse than lifting none: a draft lesson inside a published
    // module would render while its sibling in a draft module 404s, and the
    // admin would have no way to tell which gate stopped them.
    const previewing = Boolean(req.preview);
    const publishFilter = previewing ? {} : { isPublished: true };

    const withFlag = (attributes) =>
      previewing ? [...attributes, "isPublished"] : attributes;

    const lesson = await FreeCourseLesson.findOne({
      where: {
        slug: lessonSlug,
        ...publishFilter,
      },

      include: [
        {
          model: FreeCourseModule,

          required: true,

          attributes: withFlag([
            "id",
            "title",
            "slug",
          ]),

          where: {
            slug: moduleSlug,
            ...publishFilter,
          },

          include: [
            {
              model: FreeCourse,

              required: true,

              attributes: withFlag([
                "id",
                "title",
                "slug",
              ]),

              where: {
                slug: courseSlug,
                ...publishFilter,
              },
            },
          ],
        },
      ],
    });

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: lesson,
    });
  }
);

export const getCourseProgress = asyncWrapper(async (req, res) => {
  const { slug } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "userId is required",
    });
  }

  // 1. Find course
  const course = await FreeCourse.findOne({
    where: {
      slug,
      isPublished: true,
    },

    attributes: [
      "id",
      "slug",
      "title",
    ],
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  // 2. Get all published lessons of published modules
  const lessons = await FreeCourseLesson.findAll({
    where: {
      isPublished: true,
    },

    attributes: ["id"],

    include: [
      {
        model: FreeCourseModule,

        attributes: [],

        required: true,

        where: {
          freeCourseId: course.id,
          isPublished: true,
        },
      },
    ],
  });

  const lessonIds = lessons.map((lesson) => lesson.id);

  // No lessons found
  if (!lessonIds.length) {
    return res.status(200).json({
      success: true,
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      totalLessons: 0,
      completedLessonsCount: 0,
      completedLessons: [],
      progress: 0,
      completed: false,
    });
  }

  // 3. Get completed lessons
  const completedRows = await FreeCourseLessonProgress.findAll({
    where: {
      userId,
      freeCourseLessonId: lessonIds,
      completed: true,
    },

    attributes: ["freeCourseLessonId"],
  });

  const completedLessonIds = completedRows.map(
    (row) => row.freeCourseLessonId
  );

  const progress = Math.round(
    (completedLessonIds.length / lessonIds.length) * 100
  );

  return res.status(200).json({
    success: true,

    courseId: course.id,
    slug: course.slug,
    title: course.title,

    totalLessons: lessonIds.length,

    completedLessonsCount: completedLessonIds.length,

    completedLessons: completedLessonIds,

    progress,

    completed: progress === 100,
  });
});