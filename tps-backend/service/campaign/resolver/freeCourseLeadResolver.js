const { Op } = require("sequelize");
const { CourseEnrollment, users } = require("../../../models");

async function resolveFreeCourseLeads(filters) {
  const courseIds = filters?.courseIds;
  // An enabled source without selected courses must not target every enrollment.
  if (!Array.isArray(courseIds) || !courseIds.length) return [];

  const enrollments = await CourseEnrollment.findAll({
    where: { course_id: { [Op.in]: courseIds } },
    attributes: ["id", "name", "phone", "form_data"],
    include: [{ model: users, as: "user", attributes: ["email"], required: false }],
  });

  return enrollments.map((enrollment) => ({
    email: (enrollment.form_data?.email || enrollment.user?.email || "").trim(),
    name: enrollment.name,
    phone: enrollment.phone,
    source_type: "free_courses",
    source_id: enrollment.id,
  }));
}

module.exports = { resolveFreeCourseLeads };
