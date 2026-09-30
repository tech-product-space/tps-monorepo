import { Op } from "sequelize";

import db from "../../../database/postgres/models/index.js";
import {
  CAMPAIGN_SOURCE_TYPE,
  FREE_COURSE_PROGRESS_STATE,
} from "../../../config/constants/campaign.js";
import { USER_STATUS } from "../../../config/constants/user.js";

const { sequelize, User } = db;

/**
 * How far through a free course somebody actually got.
 *
 * The paid-course pitch, and the only source here that says anything about
 * engagement — `freeCourseEnrolments` tells you somebody signed up, which is a
 * click; this tells you they did the work.
 *
 * **`completed` means every published lesson**, computed against the course's
 * current lesson count rather than a stored flag. Two consequences, both
 * deliberate:
 *
 *   - "Nearly finished" is not completed. A congratulations-on-finishing email
 *     to somebody with three lessons left reads as though nobody checked.
 *   - Adding a lesson to a course moves people out of `completed` and back into
 *     `inProgress`, which is correct: they have not done the new one.
 *
 * `lastActivityBefore` is what turns `inProgress` into the segment worth
 * having — *stalled*, not merely unfinished. Somebody who watched a lesson this
 * morning does not need a "still there?" email.
 *
 * The ratio is SQL because it is a three-table join aggregated per user per
 * course and compared against a per-course total; through `findAll` that is a
 * grouped query with a correlated subquery in `HAVING`, no faster and much
 * harder to read. The addresses are still fetched through the `User` model —
 * `users` is the one table here with `underscored: true` (`full_name`, not
 * `"fullName"`), so hand-written SQL against it is a trap.
 */
export const resolveFreeCourseProgress = async (filters = {}) => {
  const courseIds = Array.isArray(filters.freeCourseId)
    ? filters.freeCourseId.filter(Boolean)
    : filters.freeCourseId
      ? [filters.freeCourseId]
      : [];

  // Completion is a ratio against one course's lessons, so it has no meaning
  // without a course. Resolving to every learner of everything instead would be
  // a very expensive misreading of an empty picker.
  if (!courseIds.length) return [];

  const state = Object.values(FREE_COURSE_PROGRESS_STATE).includes(filters.state)
    ? filters.state
    : FREE_COURSE_PROGRESS_STATE.ANY;

  const cutoff = filters.lastActivityBefore
    ? new Date(filters.lastActivityBefore)
    : null;

  const hasCutoff = cutoff && !Number.isNaN(cutoff.getTime());

  // Only published lessons count, on both sides of the ratio. Counting a draft
  // lesson in the denominator would mean nobody can ever complete a course that
  // has unpublished work in it.
  const DONE = 'COUNT(DISTINCT p."freeCourseLessonId") FILTER (WHERE p.completed)';

  const havingParts = [];

  if (state === FREE_COURSE_PROGRESS_STATE.COMPLETED) {
    havingParts.push(`${DONE} >= MAX(tot.total)`);
  } else if (state === FREE_COURSE_PROGRESS_STATE.IN_PROGRESS) {
    havingParts.push(`${DONE} < MAX(tot.total)`);
  }

  if (hasCutoff) havingParts.push('MAX(p."updatedAt") < :cutoff');

  const having = havingParts.length ? `HAVING ${havingParts.join(" AND ")}` : "";

  const rows = await sequelize.query(
    `
    WITH totals AS (
      SELECT m."freeCourseId", COUNT(*) AS total
      FROM "FreeCourseLessons" l
      JOIN "FreeCourseModules" m ON m.id = l."freeCourseModuleId"
      WHERE l."isPublished" = true
      GROUP BY m."freeCourseId"
    )
    SELECT p."userId" AS "userId"
    FROM "FreeCourseLessonProgress" p
    JOIN "FreeCourseLessons" l   ON l.id = p."freeCourseLessonId"
    JOIN "FreeCourseModules" m   ON m.id = l."freeCourseModuleId"
    JOIN totals              tot ON tot."freeCourseId" = m."freeCourseId"
    WHERE m."freeCourseId" IN (:courseIds)
      AND l."isPublished" = true
    GROUP BY p."userId", m."freeCourseId"
    ${having};
    `,
    {
      replacements: {
        courseIds,
        ...(hasCutoff ? { cutoff } : {}),
      },
      type: sequelize.QueryTypes.SELECT,
    },
  );

  if (!rows.length) return [];

  // Grouped per user *per course*, so somebody enrolled in two of the selected
  // courses appears twice. Deduped here rather than left to buildRecipients so
  // the preview's per-source row count is not quietly inflated.
  const userIds = [...new Set(rows.map((r) => r.userId))];

  const users = await User.findAll({
    where: {
      id: { [Op.in]: userIds },
      status: USER_STATUS.ACTIVE,
      email: { [Op.ne]: null },
    },
    attributes: ["id", "fullName", "email"],
    raw: true,
  });

  return users.map((user) => ({
    name: user.fullName || null,
    email: user.email,
    sourceType: CAMPAIGN_SOURCE_TYPE.FREE_COURSE_PROGRESS,
    sourceId: user.id,
  }));
};
