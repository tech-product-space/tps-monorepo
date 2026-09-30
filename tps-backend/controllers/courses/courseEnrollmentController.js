const {
  Course,
  CourseModule,
  CourseModuleLesson,
  CourseEnrollment,
  UserLessonProgress,
  UserCourseCertificate,
  users,
} = require("../../models");

const {
  COURSE_STATUS,
  COURSE_MODULE_STATUS,
  COURSE_LESSON_STATUS,
} = require("../../constants/course");
const { getPaginationParams, getMeta } = require("../../utils/pagination");

module.exports = {
  // POST /courses/slug/:slug/enroll
  async enrollBySlug(req, res) {
    const { slug } = req.params;
    const { user_id, name, phone, form_data } = req.body;

    if (!user_id || !name) {
      return res.status(400).json({ message: "user_id and name are required" });
    }

    // 1. Validate course
    const course = await Course.findOne({
      where: { slug },
    });

    const courseId = course.id;

    if (!course) {
      return res
        .status(404)
        .json({ message: "Course not found or not published" });
    }

    // 2. Prevent duplicate enrollment
    const existing = await CourseEnrollment.findOne({
      where: { user_id, course_id: courseId },
    });

    if (existing) {
      return res.status(409).json({
        message: "User already enrolled",
        enrollmentId: existing.id,
      });
    }

    // 3. Create enrollment
    const enrollment = await CourseEnrollment.create({
      user_id,
      course_id: courseId,
      name,
      phone,
      form_data: form_data || {},
    });

    // 4. Find first lesson
    const firstModule = await CourseModule.findOne({
      where: {
        course_id: courseId,
        status: COURSE_MODULE_STATUS.PUBLISHED,
      },
      order: [["order", "ASC"]],
    });

    let firstLesson = null;

    if (firstModule) {
      firstLesson = await CourseModuleLesson.findOne({
        where: {
          module_id: firstModule.id,
          status: COURSE_LESSON_STATUS.PUBLISHED,
        },
        order: [["order", "ASC"]],
      });
    }

    return res.status(201).json({
      message: "Enrolled successfully",
      enrollmentId: enrollment.id,
      course: {
        id: course.id,
        slug: course.slug,
      },
      firstModule: firstModule
        ? {
            id: firstModule.id,
            slug: firstModule.slug,
          }
        : null,
      firstLesson: firstLesson
        ? {
            id: firstLesson.id,
            slug: firstLesson.slug,
          }
        : null,
    });
  },

  // GET /courses/slug/:slug/enrollment?user_id=123
  async checkEnrollmentBySlug(req, res) {
    const { slug } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        message: "user_id is required",
      });
    }

    // 1. Validate course
    const course = await Course.findOne({
      where: {
        slug
      },
    });

    if (!course) {
      return res.status(404).json({
        message: "Course not found or not published",
      });
    }

    // 2. Check enrollment
    const enrollment = await CourseEnrollment.findOne({
      where: {
        user_id,
        course_id: course.id,
      },
    });

    if (!enrollment) {
      return res.status(200).json({
        enrolled: false,
        message: "User is not enrolled in this course",
      });
    }

    // 3. Find first module
    const firstModule = await CourseModule.findOne({
      where: {
        course_id: course.id,
        status: COURSE_MODULE_STATUS.PUBLISHED,
      },
      order: [["order", "ASC"]],
    });

    // 4. Find first lesson
    let firstLesson = null;

    if (firstModule) {
      firstLesson = await CourseModuleLesson.findOne({
        where: {
          module_id: firstModule.id,
          status: COURSE_LESSON_STATUS.PUBLISHED,
        },
        order: [["order", "ASC"]],
      });
    }

    // 5. Response (same structure as enroll)
    return res.status(200).json({
      enrolled: true,
      enrollmentId: enrollment.id,
      course: {
        id: course.id,
        slug: course.slug,
      },
      firstModule: firstModule
        ? {
            id: firstModule.id,
            slug: firstModule.slug,
          }
        : null,
      firstLesson: firstLesson
        ? {
            id: firstLesson.id,
            slug: firstLesson.slug,
          }
        : null,
    });
  },

  // GET /courses/:courseId/enrollments
  async getEnrollmentsByCourse(req, res) {
    try {
      const { page, limit, offset } = getPaginationParams(req.query);
      const { courseId } = req.params;

      // Validate course exists
      const course = await Course.findByPk(courseId, {
        attributes: ["id", "title", "slug"],
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      //  Get ALL lesson IDs for this course (ONCE)
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
              course_id: courseId,
              status: COURSE_MODULE_STATUS.PUBLISHED 
            },
          },
        ],
        raw: true,
      });

      const lessonIds = lessons.map((l) => l.id);
      const totalLessons = lessonIds.length;

      //  Fetch enrollments with users
      const { count, rows } = await CourseEnrollment.findAndCountAll({
        where: { course_id: courseId },
        attributes: ["id", "name", "phone", "form_data", "createdAt"],
        include: [
          {
            model: users,
            as: "user",
            attributes: ["id", "name", "email", "phone", "profile_picture"],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      if (!rows.length) {
        return res.status(200).json({
          success: true,
          meta: getMeta(count, page, limit),
          data: [],
        });
      }

      //  Fetch completed lessons for ALL users (ONE QUERY)
      const userIds = rows.map((r) => r.user?.id).filter(Boolean);

      let completedMap = {};

      if (lessonIds.length && userIds.length) {
        const completedRows = await UserLessonProgress.findAll({
          where: {
            user_id: userIds,
            lesson_id: lessonIds,
            completed: true,
          },
          attributes: ["user_id", "lesson_id"],
          raw: true,
        });

        completedMap = completedRows.reduce((acc, row) => {
          if (!acc[row.user_id]) acc[row.user_id] = 0;
          acc[row.user_id]++;
          return acc;
        }, {});
      }

      /**
       *  Fetch certificates
       */
      const certificates = await UserCourseCertificate.findAll({
        where: {
          course_id: courseId,
          user_id: userIds,
        },
        attributes: ["user_id", "certificate_id", "createdAt"],
        raw: true,
      });

      const certificateMap = certificates.reduce((acc, cert) => {
        acc[cert.user_id] = {
          certificateId: cert.certificate_id,
          certificateGeneratedAt: cert.createdAt,
        };
        return acc;
      }, {});

      //  Attach progress + certificate to each enrollment
      const data = rows.map((enrollment) => {
        const json = enrollment.toJSON();
        const userId = json.user?.id;

        const completedLessonsCount = completedMap[userId] || 0;

        const progress =
          totalLessons === 0
            ? 0
            : Math.round((completedLessonsCount / totalLessons) * 100);

        return {
          ...json,
          progress,
          totalLessons,
          completedLessonsCount,
          completed: progress === 100,
          certificate:
            progress === 100 && certificateMap[userId]
              ? certificateMap[userId]
              : null,
        };
      });

      return res.status(200).json({
        success: true,
        meta: getMeta(count, page, limit),
        data,
      });
    } catch (error) {
      console.error("getEnrollmentsByCourse error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch enrollments",
      });
    }
  },

  //GET /courses/my-courses?userId=<userId>
  async getUserCourses(req, res) {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    /**
     *  Get enrolled courses
     */
    const enrollments = await CourseEnrollment.findAll({
      where: { user_id: userId },
      attributes: ["course_id"],
      include: [
        {
          model: Course,
          as: "course",
          attributes: ["id", "title", "subtitle", "slug", "description"],
        },
      ],
    });

    if (!enrollments.length) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const courses = enrollments.map((e) => e.course).filter(Boolean);

    const courseIds = courses.map((c) => c.id);

    /**
     *  Get ALL lessons for these courses (ONE QUERY)
     */
    const lessons = await CourseModuleLesson.findAll({
      where: {
        status: COURSE_LESSON_STATUS.PUBLISHED,
      },
      attributes: ["id"],
      include: [
        {
          model: CourseModule,
          as: "module",
          attributes: ["course_id"],
          where: {
            course_id: courseIds,
            status: COURSE_MODULE_STATUS.PUBLISHED,
          },
        },
      ],
      raw: true,
    });

    /**
     * courseId -> lessonIds[]
     */
    const courseLessonMap = lessons.reduce((acc, row) => {
      const courseId = row["module.course_id"];
      if (!acc[courseId]) acc[courseId] = [];
      acc[courseId].push(row.id);
      return acc;
    }, {});

    /**
     *  Completed lessons for this user (ONE QUERY)
     */
    const allLessonIds = lessons.map((l) => l.id);

    let completedLessonSet = new Set();

    if (allLessonIds.length) {
      const completedLessons = await UserLessonProgress.findAll({
        where: {
          user_id: userId,
          lesson_id: allLessonIds,
          completed: true,
        },
        attributes: ["lesson_id"],
        raw: true,
      });

      completedLessonSet = new Set(completedLessons.map((l) => l.lesson_id));
    }

    /**
     *  Build response (same shape as getEnrollmentsByCourse)
     */
    const data = courses.map((course) => {
      const lessonIds = courseLessonMap[course.id] || [];
      const totalLessons = lessonIds.length;

      const completedLessonsCount = lessonIds.filter((id) =>
        completedLessonSet.has(id),
      ).length;

      const progress =
        totalLessons === 0
          ? 0
          : Math.round((completedLessonsCount / totalLessons) * 100);

      return {
        id: course.id,
        title: course.title,
        subtitle: course.subtitle,
        slug: course.slug,
        description: course.description,
        course_progress: {
          progress,
          totalLessons,
          completedLessonsCount,
          completed: progress === 100,
        },
      };
    });

    return res.status(200).json({
      success: true,
      data,
    });
  },
};
