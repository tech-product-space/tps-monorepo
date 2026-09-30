const {
  Course,
  CourseModule,
  CourseFAQ,
  CourseModuleLesson,
  CourseTag,
  UserLessonProgress,
} = require("../../models");
const { Op, where } = require("sequelize");

// Reusable association for returning a course's tags without the join-table rows.
const tagInclude = {
  model: CourseTag,
  as: "tags",
  attributes: ["id", "name", "slug"],
  through: { attributes: [] },
};
const { toSlug } = require("../../utils/slugHelpers");
const {
  COURSE_TYPE,
  COURSE_STATUS,
  COURSE_MODULE_STATUS,
  COURSE_LESSON_STATUS,
} = require("../../constants/course");

module.exports = {
  // POST /courses
  async create(req, res) {
    const {
      title,
      subtitle,
      description,
      slug,
      price,
      is_video_course,
      thumbnail,
      thumbnail_video,
      duration,
      type,
      status,
      content,
      seo_meta,
      tagIds,
    } = req.body;

    if (!slug || !title) {
      return res
        .status(400)
        .json({ message: "'slug' and 'title' is required" });
    }

    if (status && !Object.values(COURSE_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid course 'status'" });
    }

    if (type && !Object.values(COURSE_TYPE).includes(type)) {
      return res.status(400).json({ message: "Invalid course 'type'" });
    }

    const existing = await Course.findOne({ where: { slug: slug } });
    if (existing) {
      return res.status(400).json({ message: "Slug already exists" });
    }

    const course = await Course.create({
      title,
      subtitle,
      description,
      slug,
      price,
      is_video_course: !!is_video_course,
      thumbnail,
      thumbnail_video,
      duration,
      type: type || COURSE_TYPE.ONLINE,
      status: status || COURSE_STATUS.DRAFT,
      content: content || {},
      seo_meta: seo_meta || {},
    });

    if (Array.isArray(tagIds)) {
      await course.setTags(tagIds);
    }

    const created = await Course.findByPk(course.id, { include: [tagInclude] });

    return res.status(201).json(created);
  },

  // PUT /courses/:id
  async update(req, res) {
    const { id } = req.params;

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const { tagIds, ...updates } = req.body;

    if (
      updates.status &&
      !Object.values(COURSE_STATUS).includes(updates.status)
    ) {
      return res.status(400).json({ message: "Invalid course 'status'" });
    }

    if (updates.type && !Object.values(COURSE_TYPE).includes(updates.type)) {
      return res.status(400).json({ message: "Invalid course 'type'" });
    }

    // Handle slug uniqueness if updating slug
    if (updates.slug && updates.slug !== course.slug) {
      const exists = await Course.findOne({
        where: { slug: updates.slug, id: { [Op.ne]: id } },
      });

      if (exists) {
        return res.status(400).json({ message: "Slug already exists" });
      }
    }

    await course.update(updates);

    if (Array.isArray(tagIds)) {
      await course.setTags(tagIds);
    }

    const updated = await Course.findByPk(course.id, { include: [tagInclude] });

    return res.json(updated);
  },

  // GET /courses/admin/all
  async getAll(req, res) {
    const courses = await Course.findAll({
      order: [["createdAt", "DESC"]],
      include: [tagInclude],
    });

    return res.json(courses);
  },

  // GET /courses
  async getPublished(req, res) {
    const courses = await Course.findAll({
      where: { status: COURSE_STATUS.PUBLISHED },
      order: [["createdAt", "DESC"]],
      include: [tagInclude],
    });

    // Published-module count per course (one grouped query, then merged in).
    const moduleCounts = await CourseModule.findAll({
      attributes: [
        "course_id",
        [Course.sequelize.fn("COUNT", Course.sequelize.col("id")), "count"],
      ],
      where: {
        course_id: courses.map((c) => c.id),
        status: COURSE_MODULE_STATUS.PUBLISHED,
      },
      group: ["course_id"],
      raw: true,
    });

    const countByCourse = moduleCounts.reduce((acc, row) => {
      acc[row.course_id] = Number(row.count);
      return acc;
    }, {});

    const payload = courses.map((course) => ({
      ...course.toJSON(),
      modules: countByCourse[course.id] || 0,
    }));

    return res.json(payload);
  },

  // GET /courses/slug/:slug
  async getBySlug(req, res) {
    const { slug } = req.params;

    const course = await Course.findOne({
      where: { slug },
      include: [tagInclude],
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json(course);
  },

  // GET /courses/slug/:slug/full
  async getFullDetailsBySlug(req, res) {
    const { slug } = req.params;

    const course = await Course.findOne({
      where: { slug },
      include: [tagInclude],
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course_modules = await CourseModule.findAll({
      where: {
        course_id: course.id,
        status: COURSE_MODULE_STATUS.PUBLISHED,
      },
      order: [["order", "ASC"]],
    });

    const faqs = await CourseFAQ.findAll({
      where: { course_id: course.id },
      order: [["order", "ASC"]],
    });

    return res.json({
      course,
      modules: course_modules,
      faqs,
    });
  },

  // GET /courses/:id/full
  async getFullDetailsById(req, res) {
    const { id } = req.params;

    const course = await Course.findByPk(id, { include: [tagInclude] });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course_modules = await CourseModule.findAll({
      where: { course_id: course.id },
      order: [["order", "ASC"]],
    });

    const faqs = await CourseFAQ.findAll({
      where: { course_id: course.id },
      attributes: ["question", "answer", "order"],
      order: [["order", "ASC"]],
    });

    return res.json({
      course,
      modules: course_modules,
      faqs,
    });
  },

  // DELETE /courses/:id
  async delete(req, res) {
    const { id } = req.params;

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    await course.destroy();

    return res.json({ message: "Course deleted successfully" });
  },

  //GET /courses/check-slug?slug=<slug>&excludeId=<excludeId>
  async checkSlugAvailability(req, res) {
    const { excludeId } = req.query;
    const rawSlug = req.query.slug?.trim();

    if (!rawSlug) {
      return res.status(400).json({
        available: false,
        message: "Slug is required",
      });
    }

    const slug = toSlug(rawSlug).toLowerCase();

    const whereClause = { slug };

    if (excludeId) {
      whereClause.id = { [Op.ne]: excludeId };
    }

    const existing = await Course.findOne({ where: whereClause });

    return res.json({
      slug,
      available: !existing,
    });
  },

  // PUT /courses/:id/status
  async updateCourseStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (!Object.values(COURSE_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid course 'status'" });
    }

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    await course.update({ status });

    return res.json({
      message: "Course status updated successfully",
      id: course.id,
      status: course.status,
    });
  },

  // GET /courses/slug/:slug/structure
  async getCourseStructureBySlug(req, res) {
    const { slug } = req.params;

    const course = await Course.findOne({
      where: { slug },
      attributes: ["id", "title", "slug"],
      include: [
        {
          model: CourseModule,
          as: "modules",
          attributes: ["id", "title", "slug", "order"],
          where: { status: COURSE_MODULE_STATUS.PUBLISHED },
          order: [["order", "ASC"]],
          include: [
            {
              model: CourseModuleLesson,
              as: "lessons",
              attributes: [
                "id",
                "title",
                "slug",
                "order",
              ],
              where: { status: COURSE_LESSON_STATUS.PUBLISHED },
              required: false,
              order: [["order", "ASC"]],
            },
          ],
        },
      ],
      order: [
        [{ model: CourseModule, as: "modules" }, "order", "ASC"],
        [
          { model: CourseModule, as: "modules" },
          { model: CourseModuleLesson, as: "lessons" },
          "order",
          "ASC",
        ],
      ],
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json(course);
  },

  // GET /courses/slug/:slug/progress?userId=<userId>
  async getCourseProgress(req, res) {
    const { slug } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // 1. Find course
    const course = await Course.findOne({
      where: { slug },
      attributes: ["id", "slug", "title"],
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 2. Get all lessons in this course
    const lessons = await CourseModuleLesson.findAll({
      where: {
        status: COURSE_LESSON_STATUS.PUBLISHED,
      },
      attributes: ["id"],
      include: [
        {
          model: CourseModule,
          as: "module",
          attributes: [],
          where: { 
              course_id: course.id,
              status: COURSE_MODULE_STATUS.PUBLISHED 
          },
        },
      ],
    });

    const lessonIds = lessons.map((l) => l.id);

    if (!lessonIds.length) {
      return res.json({
        courseId: course.id,
        slug: course.slug,
        totalLessons: 0,
        completedLessonsCount: 0,
        completedLessons: [],
        progress: 0,
        completed: false,
      });
    }

    // 3. Get completed lessons for user
    const completedRows = await UserLessonProgress.findAll({
      where: {
        user_id: userId,
        lesson_id: lessonIds,
        completed: true,
      },
      attributes: ["lesson_id"],
    });

    const completedLessonIds = completedRows.map((r) => r.lesson_id);

    const progress = Math.round(
      (completedLessonIds.length / lessonIds.length) * 100,
    );

    return res.json({
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      totalLessons: lessonIds.length,
      completedLessonsCount: completedLessonIds.length,
      completedLessons: completedLessonIds,
      progress,
      completed: progress === 100,
    });
  },
};
