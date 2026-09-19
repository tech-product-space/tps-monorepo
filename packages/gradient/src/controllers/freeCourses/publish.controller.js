import db from "../../database/postgres/models/index.js";
const { FreeCourse, FreeCourseModule, FreeCourseLesson, sequelize } = db;

import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

/**
 * Bulk publish / unpublish across one course's curriculum.
 *
 * Replaces a page of one-at-a-time toggles: a course with eight modules and six
 * lessons each took fifty-six dropdown round trips to put live, which is not a
 * workflow so much as an endurance test.
 *
 * **Everything is scoped to the course in the path.** The ids arrive in the
 * body, so without re-reading them against `:id` this would be an endpoint that
 * flips the publish flag on any module or lesson in the database given its id.
 * The two queries below do that filtering in SQL rather than trusting the
 * caller, and anything that does not belong is silently not updated — the
 * response reports what actually changed, so a mismatch shows up as a count
 * that does not match what was asked for.
 */

/** PATCH /free-courses/:id/curriculum/publish — adminAuth */
export const bulkPublishCurriculum = asyncWrapper(async (req, res) => {
  const { id: courseId } = req.params;
  const { isPublished, moduleIds = [], lessonIds = [], includeCourse } = req.body ?? {};

  if (typeof isPublished !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isPublished must be true or false",
    });
  }

  if (!Array.isArray(moduleIds) || !Array.isArray(lessonIds)) {
    return res.status(400).json({
      success: false,
      message: "moduleIds and lessonIds must be arrays",
    });
  }

  const course = await FreeCourse.findByPk(courseId, {
    attributes: ["id", "title", "isPublished"],
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Free course not found",
    });
  }

  const result = await sequelize.transaction(async (transaction) => {
    let modules = 0;
    let lessons = 0;

    if (moduleIds.length) {
      const [count] = await FreeCourseModule.update(
        { isPublished },
        {
          where: {
            id: { [Op.in]: moduleIds },
            // The scope check. Not a belt-and-braces extra — without it the
            // body decides which rows are touched.
            freeCourseId: courseId,
          },
          transaction,
        },
      );

      modules = count;
    }

    if (lessonIds.length) {
      // Lessons hang off modules, not off the course, so the same check needs a
      // subquery rather than a column comparison.
      const owned = await FreeCourseLesson.findAll({
        attributes: ["id"],
        where: { id: { [Op.in]: lessonIds } },
        include: [
          {
            model: FreeCourseModule,
            required: true,
            attributes: [],
            where: { freeCourseId: courseId },
          },
        ],
        transaction,
      });

      if (owned.length) {
        const [count] = await FreeCourseLesson.update(
          { isPublished },
          {
            where: { id: { [Op.in]: owned.map((l) => l.id) } },
            transaction,
          },
        );

        lessons = count;
      }
    }

    let courseChanged = false;

    if (includeCourse === true && course.isPublished !== isPublished) {
      await course.update({ isPublished }, { transaction });
      courseChanged = true;
    }

    return { modules, lessons, courseChanged };
  });

  // The count is the interesting part of this row, exactly as it is for the
  // event guest bulk action.
  req.activity?.set({
    entityLabel: course.title,
    metadata: {
      affectedCount: result.modules + result.lessons,
      modules: result.modules,
      lessons: result.lessons,
      course: result.courseChanged,
      isPublished,
    },
  });

  return res.status(200).json({
    success: true,
    message: buildMessage(result, isPublished),
    data: {
      ...result,
      isPublished,
    },
  });
});

/**
 * "3 modules and 9 lessons published" — the admin asked for a specific set and
 * deserves to be told what actually moved, not just "done".
 */
const buildMessage = ({ modules, lessons, courseChanged }, isPublished) => {
  const verb = isPublished ? "published" : "moved to draft";

  const parts = [];

  if (modules) parts.push(`${modules} ${modules === 1 ? "module" : "modules"}`);
  if (lessons) parts.push(`${lessons} ${lessons === 1 ? "lesson" : "lessons"}`);
  if (courseChanged) parts.push("the course");

  if (!parts.length) return "Nothing to update";

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return `${list} ${verb}`;
};
