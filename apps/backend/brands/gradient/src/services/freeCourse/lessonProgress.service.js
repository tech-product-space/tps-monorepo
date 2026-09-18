import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { FreeCourseModule, FreeCourseLesson, FreeCourseLessonProgress } = db;

/**
 * Every lesson of every given course, in the order a learner walks them:
 * module order first, then lesson order inside it.
 *
 * Two queries for any number of courses, not two per course — the dashboard
 * asks about a person's whole shelf at once, and per-course lookups are how a
 * list page turns into forty round trips.
 *
 * **Unpublished modules and lessons are excluded.** A learner cannot open them,
 * so counting them means the progress bar can never reach the end, and picking
 * one as "next" sends them to a page that is not there.
 */
export const orderedLessonsByCourse = async (courseIds) => {
  const byCourse = new Map(courseIds.map((id) => [id, []]));

  if (!courseIds.length) return byCourse;

  const modules = await FreeCourseModule.findAll({
    where: { freeCourseId: { [Op.in]: courseIds }, isPublished: true },
    attributes: ["id", "freeCourseId", "slug", "title", "order"],
    order: [["order", "ASC"]],
  });

  if (!modules.length) return byCourse;

  const lessons = await FreeCourseLesson.findAll({
    where: {
      freeCourseModuleId: { [Op.in]: modules.map((m) => m.id) },
      isPublished: true,
    },
    attributes: ["id", "freeCourseModuleId", "slug", "title", "order"],
    order: [["order", "ASC"]],
  });

  const lessonsByModule = new Map();
  for (const lesson of lessons) {
    if (!lessonsByModule.has(lesson.freeCourseModuleId)) {
      lessonsByModule.set(lesson.freeCourseModuleId, []);
    }
    lessonsByModule.get(lesson.freeCourseModuleId).push(lesson);
  }

  // Modules are already in order, so appending module by module produces the
  // full walk order without a second sort.
  for (const module of modules) {
    const bucket = byCourse.get(module.freeCourseId);
    if (!bucket) continue;

    for (const lesson of lessonsByModule.get(module.id) || []) {
      bucket.push({
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        moduleSlug: module.slug,
        moduleTitle: module.title,
      });
    }
  }

  return byCourse;
};

/** Which of these lessons has this user finished. One query, any number of courses. */
export const completedLessonIds = async (userId, lessonIds) => {
  if (!userId || !lessonIds.length) return new Set();

  const rows = await FreeCourseLessonProgress.findAll({
    where: {
      userId,
      completed: true,
      freeCourseLessonId: { [Op.in]: lessonIds },
    },
    attributes: ["freeCourseLessonId"],
  });

  return new Set(rows.map((row) => row.freeCourseLessonId));
};

/**
 * Where this learner should land: the first lesson they have not finished.
 *
 * When everything is done, hand back the last lesson rather than null. The
 * caller still needs somewhere to send them — "revisit the course" is a real
 * action, and a null here becomes a broken link at the other end.
 */
export const pickNextLesson = (lessons, completed) => {
  if (!lessons.length) {
    return { nextLesson: null, completedCourse: false, completedCount: 0 };
  }

  const completedCount = lessons.filter((lesson) =>
    completed.has(lesson.id),
  ).length;

  const next = lessons.find((lesson) => !completed.has(lesson.id));

  return {
    nextLesson: next || lessons[lessons.length - 1],
    completedCourse: !next,
    completedCount,
  };
};

/**
 * The single-course case, for callers that already know which course they mean.
 *
 * Shared with `checkEnrollFreeCourse` so "where do I resume?" has one answer on
 * the course page and on the dashboard. They disagreed before this existed.
 */
export const resolveCourseProgress = async (userId, courseId) => {
  const byCourse = await orderedLessonsByCourse([courseId]);
  const lessons = byCourse.get(courseId) || [];
  const completed = await completedLessonIds(
    userId,
    lessons.map((lesson) => lesson.id),
  );

  return { lessons, ...pickNextLesson(lessons, completed) };
};
