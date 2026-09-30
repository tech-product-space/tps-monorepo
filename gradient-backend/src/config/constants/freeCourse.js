/**
 * Free courses — the gated, lesson-based courses, distinct from Courses (paid
 * programs, whose row owns only the commercial layer).
 */

/**
 * Per-course switches, stored in FreeCourses.settings (JSONB) and read only
 * through `resolveFreeCourseSettings()` — never off the model directly, or a
 * row saved before a key existed behaves as though that key were false.
 */
export const FREE_COURSE_SETTINGS_DEFAULTS = Object.freeze({
  // Render and email the certificate the moment the last lesson is completed,
  // instead of leaving it for an admin to generate by hand.
  autoIssueCertificate: true,
});

/**
 * One row per template in FreeCourseEmailTemplates, keyed by (freeCourseId,
 * type). Adding a new email later is a new entry here — the admin panel renders
 * a card per type — so no migration is needed.
 */
export const FREE_COURSE_EMAIL_TYPES = Object.freeze({
  /** Sent with the certificate, once the PDF exists. */
  CERTIFICATE: "CERTIFICATE",
});

export const FREE_COURSE_EMAIL_TYPE_LIST = Object.values(
  FREE_COURSE_EMAIL_TYPES,
);
