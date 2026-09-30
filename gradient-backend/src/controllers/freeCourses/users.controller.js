import db from "../../database/postgres/models/index.js";
const {
  FreeCourseEnrollment,
  FreeCourse,
  FreeCourseModule,
  FreeCourseLesson,
} = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { resolveCourseProgress } from "../../services/freeCourse/lessonProgress.service.js";


export const enrollFreeCourse = asyncWrapper(async (req, res) => {
  const { userId, courseId, name, phone, formData } = req.body;

  if (!userId || !courseId) {
    return res.status(400).json({
      success: false,
      message: "userId and courseId are required",
    });
  }

  const course = await FreeCourse.findByPk(courseId);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  // Find first module
  const firstModule = await FreeCourseModule.findOne({
    where: {
      freeCourseId: courseId,
    },
    order: [["order", "ASC"]],
  });

  // Find first lesson
  let firstLesson = null;

  if (firstModule) {
    firstLesson = await FreeCourseLesson.findOne({
      where: {
        freeCourseModuleId: firstModule.id,
      },
      order: [["order", "ASC"]],
    });
  }

  // Check existing enrollment
  const existingEnrollment = await FreeCourseEnrollment.findOne({
    where: { userId, courseId },
  });

  // If already enrolled
  if (existingEnrollment) {
    // Send them where they stopped, through the same resolver the dashboard
    // and check-enrollment use. This previously filtered lessons by a
    // `freeCourseId` column that FreeCourseLesson does not have — lessons hang
    // off a module, not a course — so the lookup threw and re-enrolling from
    // the course page failed outright.
    const { nextLesson } = await resolveCourseProgress(userId, courseId);

    return res.status(200).json({
      success: true,
      alreadyEnrolled: true,
      enrollmentId: existingEnrollment.id,

      redirectLesson: nextLesson
        ? {
            id: nextLesson.id,
            slug: nextLesson.slug,
          }
        : firstLesson
        ? {
            id: firstLesson.id,
            slug: firstLesson.slug,
          }
        : null,

      firstModule: firstModule
        ? {
            id: firstModule.id,
            slug: firstModule.slug,
          }
        : null,
    });
  }

  // Create enrollment
  const enrollment = await FreeCourseEnrollment.create({
    userId,
    courseId,
    name,
    phone,
    formData,
  });

  return res.status(201).json({
    success: true,
    enrollmentId: enrollment.id,

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
});


export const checkEnrollFreeCourse = asyncWrapper(async (req, res) => {
  const { userId, courseId } = req.query;

  if (!userId || !courseId) {
    return res.status(400).json({
      success: false,
      message: "userId and courseId are required",
    });
  }

  // Validate course
  const course = await FreeCourse.findByPk(courseId);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  // Check enrollment
  const enrollment = await FreeCourseEnrollment.findOne({
    where: {
      userId,
      courseId,
    },
  });

  // User not enrolled
  if (!enrollment) {
    return res.status(200).json({
      success: true,
      enrolled: false,
      startLesson: null,
      completedCourse: false,
    });
  }

  // "Where do I resume?" is answered in one place now, so the course page and
  // the dashboard cannot send the same learner to two different lessons. The
  // resolver also skips unpublished lessons, which this did not — previously a
  // learner could be sent to a lesson that is not live yet.
  const { nextLesson, completedCourse } = await resolveCourseProgress(
    userId,
    courseId,
  );

  return res.status(200).json({
    success: true,
    enrolled: true,
    enrollmentId: enrollment.id,

    startLesson: nextLesson
      ? {
          id: nextLesson.id,
          slug: nextLesson.slug,
        }
      : null,

    completedCourse,
  });
});