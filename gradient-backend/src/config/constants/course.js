/**
 * Paid programs (Courses) — distinct from FreeCourses, which are the gated
 * lesson-based courses. A Course row owns only the commercial layer of a
 * program: pricing, emails, brochure and toggles. The marketing page itself
 * stays hardcoded per course in the website repo.
 */

/**
 * One row per template in CourseEmailTemplates, keyed by (courseId, type).
 * Adding a new email later is a new entry here — the admin panel renders a
 * card per type automatically, so no migration is needed.
 */
export const COURSE_EMAIL_TYPES = Object.freeze({
  /** To the applicant, right after the enrollment form is submitted. */
  ENROLLMENT_ACK: "ENROLLMENT_ACK",
  /** To the applicant, carrying the brochure link the admin pasted in. */
  BROCHURE_DOWNLOAD: "BROCHURE_DOWNLOAD",
});

export const COURSE_EMAIL_TYPE_LIST = Object.values(COURSE_EMAIL_TYPES);

/**
 * Written onto the shared `leads` table so both course flows stay in the one
 * leads pipeline the admin already has, filterable by subSource.
 */
export const COURSE_LEAD_SUB_SOURCE = Object.freeze({
  ENROLLMENT: {
    subSource: "enrollment_form",
    subSourceDisplayName: "Enrollment Form",
  },
  BROCHURE: {
    subSource: "curriculum_download",
    subSourceDisplayName: "Curriculum Download",
  },
});

export const GST_MODES = Object.freeze({
  INCLUSIVE: "inclusive",
  EXCLUSIVE: "exclusive",
});

/**
 * Shape written to Courses.pricing.
 *
 * Price and discount are numbers, not display strings: the discounted price is
 * derived from them, so the headline figure can never contradict the "30% off"
 * badge sitting next to it.
 */
export const DEFAULT_COURSE_PRICING = Object.freeze({
  /** Full course price before any discount, in rupees. */
  price: null,
  /** 0–100. Zero hides the strikethrough and the discount badge entirely. */
  discountPercent: 0,
  /** ISO date (YYYY-MM-DD) the next cohort starts. */
  cohortDate: "",
  /** ISO date (YYYY-MM-DD) the current offer closes. Empty hides the line. */
  offerValidTill: "",
  /**
   * Free text for the urgency line beside the price, e.g. "Early Bird Discount
   * for 4 Seats Only!". Written out in full rather than assembled from a
   * number, so the wording can change with the campaign without a deploy.
   * Empty hides the line.
   */
  offerLabel: "",
  /**
   * Seats in one cohort, as a whole number. Drives both the seat count on the
   * pricing panel and the "Only N learners per batch" badge in the hero, so
   * the two can never quote different numbers.
   */
  cohortSeats: null,
  /** Free text, e.g. "4.5 Months". */
  durationLabel: "",
  /** One of GST_MODES. */
  gstMode: GST_MODES.INCLUSIVE,
  /** Free text, e.g. "6 Months". Empty hides the EMI line. */
  emiPlan: "",
});

/**
 * Reserved for future per-course toggles. The curriculum button is not one of
 * them: it is shown whenever a brochure is uploaded, so there is no way to
 * advertise a download that does not exist.
 */
export const DEFAULT_COURSE_SETTINGS = Object.freeze({});
