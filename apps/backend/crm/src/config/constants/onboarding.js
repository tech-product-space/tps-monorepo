// Everything the onboarding portal (onboarding.theproductspace.in) agrees on
// with the public form. The portal mirrors these in zod; this file is the
// authority. See ONBOARDING_PORTAL_PLAN.md.

/* ─── Career status ────────────────────────────────────────────────────────── */

// Drives which fields the form shows AND which the server requires. The four
// values are fixed; adding one means updating REQUIRED_BY_STATUS below and the
// portal's radio group together, or the two will disagree about requiredness.
const CAREER_STATUS = Object.freeze({
  IN_COLLEGE: "in_college",
  WORKING: "working",
  CAREER_BREAK: "career_break",
  OTHER: "other",
});

const CAREER_STATUSES = Object.freeze(Object.values(CAREER_STATUS));

const CAREER_STATUS_LABELS = Object.freeze({
  [CAREER_STATUS.IN_COLLEGE]: "In College",
  [CAREER_STATUS.WORKING]: "Working",
  [CAREER_STATUS.CAREER_BREAK]: "On a Career Break",
  [CAREER_STATUS.OTHER]: "Other",
});

/**
 * Adaptive requiredness. `required` is what must be present for that status;
 * `forbidden` is what must NOT be — a field_of_study arriving alongside
 * career_status='working' is a 400, not a silently-stored orphan, because the
 * form clears hidden fields and anything else is a client that has drifted.
 *
 * Note what is NOT here: about_studies_job and hobbies. Both were required
 * until 2026-08-07 and are now optional for every status, so neither appears in
 * any `required` list. They still count toward COMPLETION_FIELDS.
 */
const REQUIRED_BY_STATUS = Object.freeze({
  [CAREER_STATUS.IN_COLLEGE]: {
    required: ["org_name", "field_of_study"],
    forbidden: ["role_description", "career_status_other"],
  },
  [CAREER_STATUS.WORKING]: {
    required: ["org_name", "role_description", "total_experience_years"],
    forbidden: ["field_of_study", "career_status_other"],
  },
  // The same two columns as `working`, read in the past tense: org_name is
  // where they were and role_description what they did there. The portal
  // relabels both rather than storing a second pair of employer columns — a
  // "previous company" column would be null for three statuses out of four and
  // would split "where has this person worked?" across two places.
  [CAREER_STATUS.CAREER_BREAK]: {
    required: ["org_name", "role_description", "total_experience_years"],
    forbidden: ["field_of_study", "career_status_other"],
  },
  [CAREER_STATUS.OTHER]: {
    required: ["career_status_other", "org_name", "total_experience_years"],
    forbidden: ["field_of_study", "role_description"],
  },
});

/* ─── Gender ───────────────────────────────────────────────────────────────── */

// Three values, "other" free of any follow-up question. Asked because programme
// teams report on cohort composition; deliberately not a free-text field, and
// deliberately not carrying a "prefer not to say" — that is what leaving a
// non-blocking question blank already means.
const GENDER = Object.freeze({
  MALE: "male",
  FEMALE: "female",
  OTHER: "other",
});

const GENDERS = Object.freeze(Object.values(GENDER));

const GENDER_LABELS = Object.freeze({
  [GENDER.MALE]: "Male",
  [GENDER.FEMALE]: "Female",
  [GENDER.OTHER]: "Other",
});

const GENDER_OPTIONS = Object.freeze(
  GENDERS.map((value) => ({ value, label: GENDER_LABELS[value] })),
);

/* ─── Roles they're targeting after the programme ──────────────────────────── */

// Multi-select: someone open to both APM and Analyst is telling us something a
// single pick would throw away, and that breadth is exactly what placement
// support needs to know.
const TARGET_ROLE_OPTIONS = Object.freeze([
  { value: "intern", label: "Intern" },
  { value: "analyst", label: "Analyst" },
  { value: "pm", label: "Product Manager" },
  { value: "apm", label: "Associate Product Manager" },
  { value: "other", label: "Other" },
]);

const TARGET_ROLE_VALUES = Object.freeze(
  TARGET_ROLE_OPTIONS.map((o) => o.value),
);

const TARGET_ROLE_LABELS = Object.freeze(
  TARGET_ROLE_OPTIONS.reduce((acc, o) => {
    acc[o.value] = o.label;
    return acc;
  }, {}),
);

/* ─── How did you hear about us ────────────────────────────────────────────── */

const HEARD_ABOUT_OPTIONS = Object.freeze([
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "google_search", label: "Google Search" },
  { value: "referral", label: "Friend / Colleague referral" },
  { value: "event_webinar", label: "Event or Webinar" },
  { value: "college_placement_cell", label: "College / Placement cell" },
  { value: "newsletter", label: "Newsletter" },
  { value: "other", label: "Other" },
]);

const HEARD_ABOUT_VALUES = Object.freeze(
  HEARD_ABOUT_OPTIONS.map((o) => o.value),
);

/* ─── Field limits ─────────────────────────────────────────────────────────── */

const LIMITS = Object.freeze({
  AGE_MIN: 15,
  AGE_MAX: 100,
  CITY_MIN: 2,
  CITY_MAX: 100,
  ORG_MAX: 200,
  FIELD_OF_STUDY_MAX: 200,
  OTHER_MAX: 150,
  // Current role is a job title ("Senior Product Manager"), not an essay — it
  // was a 20-character-minimum textarea until 2026-08-07 and is now one line.
  ROLE_MAX: 200,
  // There are five options. A payload claiming more than five picks is a client
  // that has drifted, not a student with unusual ambitions.
  TARGET_ROLES_MAX: 5,
  EXPERIENCE_MIN: 0,
  EXPERIENCE_MAX: 60,
  // The three long-form answers. A 20-char floor keeps "na" out of the data
  // without being long enough to feel like homework on a phone keyboard.
  LONG_TEXT_MIN: 20,
  LONG_TEXT_MAX: 2000,
  URL_MAX: 500,
  // Matches lead_profile_details.secondary_email.
  EMAIL_MAX: 255,
});

// Every field that counts toward the completion meter shown in the CRM and on
// the form. Optional fields (resume_url, the alternate contact details) are
// deliberately included — a profile with a resume is more complete than one
// without, even though we do not require it.
//
// NOTE: this denominator has moved twice. The two alternate contact fields took
// it from 10 to 12, and gender + target_roles took it to 14 — so a profile that
// read 100% before those questions existed now reads lower until its owner
// comes back and answers them. Nothing behavioural keys off this number
// (isProfileComplete uses submission_count), so the effect is confined to the
// meter itself.
//
// Status-conditional fields are deliberately absent: field_of_study and
// role_description are each asked of only some career statuses, so counting
// them would cap everyone else below 100%.
const COMPLETION_FIELDS = Object.freeze([
  "age",
  "gender",
  "current_city",
  "career_status",
  "org_name",
  "total_experience_years",
  "about_studies_job",
  "hobbies",
  "linkedin_url",
  "resume_url",
  "target_roles",
  "heard_about_us",
  "secondary_email",
  "secondary_phone",
]);

/* ─── OTP / session ────────────────────────────────────────────────────────── */

const OTP = Object.freeze({
  LENGTH: 4,
  TTL_MS: 10 * 60 * 1000, // challenge lifetime
  MAX_ATTEMPTS: 5, // wrong codes before the challenge is dead
  MAX_RESENDS: 3,
  RESEND_COOLDOWN_MS: 60 * 1000,
  TOKEN_TTL: "10m", // otpToken JWT — outlives the OTP row by design
  SESSION_TTL: "30m",
  SESSION_TTL_SECONDS: 30 * 60,
});

// JWT `purpose` claims. Checked on every verify, so an onboarding token can
// never be mistaken for a CRM access token even if the secrets were ever
// misconfigured to match.
const TOKEN_PURPOSE = Object.freeze({
  OTP: "onboarding_otp",
  SESSION: "onboarding_session",
});

// Written to lead_profiles.phone_verified_source when a student clears OTP.
const PHONE_VERIFIED_SOURCE = "onboarding_portal";

/* ─── Client-facing failure codes ──────────────────────────────────────────── */

// The portal switches its UI on these. NOT_ELIGIBLE is returned byte-identically
// for "no such profile", "no active enrollment", "only dropped enrollments" and
// "ambiguous phone match" — see ONBOARDING_PORTAL_PLAN.md §3.1.
const ERROR_CODE = Object.freeze({
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  INVALID_PHONE: "INVALID_PHONE",
  OTP_INVALID: "OTP_INVALID",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_ATTEMPTS_EXCEEDED: "OTP_ATTEMPTS_EXCEEDED",
  RESEND_COOLDOWN: "RESEND_COOLDOWN",
  RESEND_LIMIT: "RESEND_LIMIT",
  SESSION_INVALID: "SESSION_INVALID",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
});

// One string for every eligibility failure. Deliberately says nothing about
// which of the four causes it was.
const NOT_ELIGIBLE_MESSAGE =
  "We couldn't find an active enrollment for this number. If you've just enrolled, give it a few minutes — otherwise reply to your onboarding email and we'll sort it out.";

module.exports = {
  CAREER_STATUS,
  CAREER_STATUSES,
  CAREER_STATUS_LABELS,
  REQUIRED_BY_STATUS,
  GENDER,
  GENDERS,
  GENDER_LABELS,
  GENDER_OPTIONS,
  TARGET_ROLE_OPTIONS,
  TARGET_ROLE_VALUES,
  TARGET_ROLE_LABELS,
  HEARD_ABOUT_OPTIONS,
  HEARD_ABOUT_VALUES,
  LIMITS,
  COMPLETION_FIELDS,
  OTP,
  TOKEN_PURPOSE,
  PHONE_VERIFIED_SOURCE,
  ERROR_CODE,
  NOT_ELIGIBLE_MESSAGE,
};
