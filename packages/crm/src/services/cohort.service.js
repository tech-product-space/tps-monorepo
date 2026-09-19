const { Op } = require("sequelize");
const { Cohort, LeadCourse, Activity } = require("../models");
const { ENROLLMENT_STATUS } = require("../config/constants/enrollment");

/**
 * List cohorts, optionally filtered by program (course_id) and active state.
 * General cohorts (course_id = null) are always included when filtering by a
 * specific course, since they apply to every program.
 */
async function listCohorts({ courseId = null, includeInactive = false } = {}) {
  const where = {};

  if (!includeInactive) {
    where.is_active = true;
  }

  if (courseId) {
    where[Op.or] = [{ course_id: courseId }, { course_id: null }];
  }

  return Cohort.findAll({
    where,
    order: [
      ["start_date", "DESC"],
      ["created_at", "DESC"],
    ],
  });
}

async function createCohort({ courseId, name, startDate, endDate, userId }) {
  if (!name || !name.trim()) {
    throw new Error("Cohort name is required");
  }

  return Cohort.create({
    course_id: courseId || null,
    name: name.trim(),
    start_date: startDate || null,
    end_date: endDate || null,
    is_active: true,
    created_by: userId,
  });
}

async function updateCohort({ id, courseId, name, startDate, endDate, isActive, userId }) {
  const cohort = await Cohort.findByPk(id);
  if (!cohort) {
    throw new Error("Cohort not found");
  }

  const oldName = cohort.name;
  const oldIsActive = cohort.is_active;

  const updates = {};
  if (courseId !== undefined) updates.course_id = courseId || null;
  if (name !== undefined) {
    if (!name || !name.trim()) throw new Error("Cohort name cannot be empty");
    updates.name = name.trim();
  }
  if (startDate !== undefined) updates.start_date = startDate || null;
  if (endDate !== undefined) updates.end_date = endDate || null;
  if (isActive !== undefined) updates.is_active = Boolean(isActive);

  await cohort.update(updates);

  const changedName = updates.name && updates.name !== oldName;
  const changedActive = isActive !== undefined && Boolean(isActive) !== oldIsActive;
  const parts = [];
  if (changedName) parts.push(`renamed from "${oldName}" to "${updates.name}"`);
  if (changedActive) parts.push(updates.is_active ? "reactivated" : "deactivated");
  if (updates.start_date !== undefined) parts.push(`start date set to ${updates.start_date || "none"}`);
  if (updates.end_date !== undefined) parts.push(`end date set to ${updates.end_date || "none"}`);

  await Activity.create({
    lead_id: null,
    profile_id: null,
    actor_id: userId || null,
    type: "Audit",
    title: `Cohort updated — ${cohort.name}`,
    details: parts.length
      ? `Cohort "${oldName}" updated: ${parts.join(", ")}.`
      : `Cohort "${oldName}" updated.`,
    metadata: {
      action: "cohort_updated",
      cohort_id: id,
      cohort_name: cohort.name,
      changes: updates,
    },
  });

  return cohort;
}

/**
 * Delete a cohort. If it is already referenced by any enrollment, soft-delete
 * by deactivating instead so historical enrollments keep resolving.
 */
async function deleteCohort(id) {
  const cohort = await Cohort.findByPk(id);
  if (!cohort) {
    throw new Error("Cohort not found");
  }

  // ACTIVE enrollments only. A cohort whose students all dropped out is dead
  // and should be deletable — keeping it alive forever clutters every cohort
  // picker with batches nobody is in.
  //
  // Safe because the dropped rows do not depend on the row surviving:
  // lead_courses.cohort_id is ON DELETE SET NULL, and cohort_name is snapshotted
  // at enroll time, so a dropped enrollment still displays its cohort by name
  // after the cohort is gone.
  const usageCount = await LeadCourse.count({
    where: { cohort_id: id, status: ENROLLMENT_STATUS.ACTIVE },
  });
  if (usageCount > 0) {
    await cohort.update({ is_active: false });
    return { deactivated: true };
  }

  await cohort.destroy();
  return { deleted: true };
}

module.exports = {
  listCohorts,
  createCohort,
  updateCohort,
  deleteCohort,
};
