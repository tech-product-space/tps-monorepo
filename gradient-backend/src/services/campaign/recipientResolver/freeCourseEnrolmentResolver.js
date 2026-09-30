import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { compact, dateRangeClause, inClause } from "./helpers.js";

const { FreeCourseEnrollment, User } = db;

/**
 * People enrolled in a free course.
 *
 * **This table has no email column** — only `userId`, `name`, `phone` and a
 * `formData` blob — so the address has to come from `users` through an inner
 * join. Two consequences worth knowing before trusting a count here:
 *
 *   1. `userId` is nullable. Any enrolment without one is unreachable by email
 *      and silently absent from this audience. `required: true` makes that a
 *      join condition rather than a row with a null address that fails later.
 *   2. The name on the enrolment is often better than the one on the account
 *      (it was typed for this specific form), so it wins where present.
 */
export const resolveFreeCourseEnrolments = async (filters = {}) => {
  const where = compact({
    courseId: inClause(filters.freeCourseId ?? filters.courseId),
    createdAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  const rows = await FreeCourseEnrollment.findAll({
    where,
    attributes: ["id", "name"],
    include: [
      {
        model: User,
        as: "user",
        attributes: ["email", "fullName"],
        required: true,
      },
    ],
    raw: true,
    nest: true,
  });

  return rows
    .filter((row) => row.user?.email)
    .map((row) => ({
      name: row.name || row.user.fullName || null,
      email: row.user.email,
      sourceType: CAMPAIGN_SOURCE_TYPE.FREE_COURSE_ENROLMENTS,
      sourceId: row.id,
    }));
};
