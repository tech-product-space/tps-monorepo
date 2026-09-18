import db from "../../database/postgres/models/index.js";
const { FreeCourse, FreeCourseEnrollment } = db;

import {
  completedLessonIds,
  orderedLessonsByCourse,
  pickNextLesson,
} from "../freeCourse/lessonProgress.service.js";
import { courseIdsWithCertificate } from "./myCourseCertificates.service.js";

/**
 * Free courses this person enrolled in, with how far through each one they are.
 *
 * Four queries total, whatever the shelf size: enrolments, modules, lessons,
 * progress. The obvious shape — loop the enrolments and ask about each course —
 * is four queries *per course*, which is what makes a dashboard feel slow at
 * exactly the moment a user has enough history to care about one.
 *
 * Enrolment is by `userId` only. Unlike events, there is no account-less path
 * into a free course: you cannot enrol without being signed in, so there are no
 * orphan rows to match by email.
 */
export const resolveMyCourses = async (userId) => {
  if (!userId) return [];

  const enrolments = await FreeCourseEnrollment.findAll({
    where: { userId },
    include: [
      {
        model: FreeCourse,
        as: "course",
        attributes: ["id", "title", "subTitle", "slug", "thumbnail"],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  // An enrolment whose course was deleted, or whose course is unpublished, is
  // not something to offer — the link would 404 or leak an unfinished page.
  const active = enrolments.filter((enrolment) => enrolment.course);

  if (!active.length) return [];

  const courseIds = [...new Set(active.map((enrolment) => enrolment.courseId))];
  const lessonsByCourse = await orderedLessonsByCourse(courseIds);

  const allLessonIds = [...lessonsByCourse.values()]
    .flat()
    .map((lesson) => lesson.id);

  const [completed, certificated] = await Promise.all([
    completedLessonIds(userId, allLessonIds),
    courseIdsWithCertificate(userId, courseIds),
  ]);

  return active.map((enrolment) => {
    const lessons = lessonsByCourse.get(enrolment.courseId) || [];
    const { nextLesson, completedCourse, completedCount } = pickNextLesson(
      lessons,
      completed,
    );

    return {
      enrolmentId: enrolment.id,
      enrolledAt: enrolment.createdAt,

      course: {
        id: enrolment.course.id,
        title: enrolment.course.title,
        subTitle: enrolment.course.subTitle,
        slug: enrolment.course.slug,
        thumbnail: enrolment.course.thumbnail,
      },

      progress: {
        completed: completedCount,
        total: lessons.length,
        // Computed here rather than in the browser so the number on the card
        // and any number we ever count server-side cannot disagree. A course
        // with no published lessons is 0%, not NaN.
        percent: lessons.length
          ? Math.round((completedCount / lessons.length) * 100)
          : 0,
        completedCourse,
      },

      /**
       * They hold a certificate for this course.
       *
       * Reported separately from `completedCourse` because the two legitimately
       * disagree: publishing a lesson after someone finished drops them below
       * 100% while their certificate stays valid. The UI treats *this* as "did
       * they finish", and keeps showing the real 14/15 on the bar — a card that
       * said "Resume" to somebody holding that course's certificate would be
       * telling them, on one screen, both that they finished and that they did
       * not.
       */
      certificateEarned: certificated.has(enrolment.courseId),

      nextLesson: nextLesson
        ? {
            slug: nextLesson.slug,
            title: nextLesson.title,
            moduleSlug: nextLesson.moduleSlug,
            moduleTitle: nextLesson.moduleTitle,
          }
        : null,
    };
  });
};
