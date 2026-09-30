import { FREE_COURSE_SETTINGS_DEFAULTS } from "../../config/constants/freeCourse.js";

/**
 * The only supported way to read FreeCourses.settings.
 *
 * Reading `course.settings.autoIssueCertificate` directly is wrong: every row
 * created before that key existed stores `{}`, so the lookup yields undefined
 * and a default-on switch reads as off. Layering the defaults underneath keeps
 * old rows behaving as intended and makes adding a switch a constant edit.
 */
export const resolveFreeCourseSettings = (course) => ({
  ...FREE_COURSE_SETTINGS_DEFAULTS,
  ...(course?.settings || {}),
});

/**
 * Merge an incoming partial into what is already stored, dropping any key that
 * is not a known setting.
 *
 * Merging rather than replacing is the documented rule for JSONB config in this
 * repo: an admin form that posts one toggle must not blank the others.
 * Filtering to known keys stops a typo'd field name from being persisted
 * forever as dead weight that never matches a default.
 */
export const mergeFreeCourseSettings = (course, incoming = {}) => {
  const allowed = Object.keys(FREE_COURSE_SETTINGS_DEFAULTS);

  const filtered = Object.fromEntries(
    Object.entries(incoming).filter(
      ([key, value]) => allowed.includes(key) && typeof value === "boolean",
    ),
  );

  return {
    ...(course?.settings || {}),
    ...filtered,
  };
};
