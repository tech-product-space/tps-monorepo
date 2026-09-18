const {
  CAREER_STATUS,
  CAREER_STATUSES,
  REQUIRED_BY_STATUS,
  GENDERS,
  TARGET_ROLE_VALUES,
  HEARD_ABOUT_VALUES,
  LIMITS,
} = require("../config/constants/onboarding");

/**
 * Server-side validation for the onboarding profile form.
 *
 * This is the AUTHORITY. The portal mirrors these rules in zod for a decent
 * typing experience, but the client is a stranger's browser and nothing it
 * sends is trusted. Every rule here is enforced regardless of what the form
 * did or did not show.
 *
 * Returns { ok: true, value } with a clean, allowlisted object ready to write,
 * or { ok: false, errors } where errors is { field: message }.
 */

/* ─── Primitives ───────────────────────────────────────────────────────────── */

// Coerces rather than type-checks, deliberately. JSON gives us `age: 24` as a
// number when the form posts it programmatically and `age: "24"` when it comes
// off an input, and a `typeof v === "string"` guard here silently reads the
// first as missing — which is exactly the bug this comment exists to prevent
// coming back.
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const isBlank = (v) => str(v).length === 0;

/**
 * https only.
 *
 * javascript: and data: are the XSS vectors — these values are rendered as
 * href in the CRM. Plain http: is rejected too: it is 2026, and a link a
 * student pastes today gets clicked by staff for years.
 */
function parseHttpsUrl(value, { host } = {}) {
  const raw = str(value);
  if (!raw) return { ok: true, value: null };
  if (raw.length > LIMITS.URL_MAX) {
    return { ok: false, message: `Must be ${LIMITS.URL_MAX} characters or fewer.` };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "That doesn't look like a valid link." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, message: "The link must start with https://" };
  }

  if (host) {
    // Suffix match on a dot boundary, so linkedin.com and www.linkedin.com pass
    // while evil-linkedin.com and linkedin.com.attacker.net do not.
    const h = url.hostname.toLowerCase();
    if (h !== host && !h.endsWith(`.${host}`)) {
      return { ok: false, message: `That must be a ${host} link.` };
    }
  }

  return { ok: true, value: url.toString() };
}

const digitsOnly = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * The last ten digits, which is how this codebase compares phone numbers —
 * same rule as the portal router's per-phone rate limiter, so +919876543210
 * and 9876543210 are one number here too.
 */
const phoneKey = (v) => digitsOnly(v).slice(-10);

/**
 * Deliberately lenient.
 *
 * This is a contact detail a human will read before they use it, not a login.
 * A regex strict enough to reject every invalid address also rejects real ones
 * (apostrophes, plus-addressing, new TLDs), and the cost of a typo here is one
 * bounced email — while the cost of refusing someone's real address is that we
 * lose the alternate contact this field exists to collect.
 */
function parseEmail(value, { max = LIMITS.EMAIL_MAX } = {}) {
  const raw = str(value);
  if (!raw) return { ok: true, value: null };
  if (raw.length > max) {
    return { ok: false, message: `Must be ${max} characters or fewer.` };
  }
  // One @, something either side, a dot in the domain, no whitespace.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(raw)) {
    return { ok: false, message: "That doesn't look like a valid email address." };
  }
  return { ok: true, value: raw.toLowerCase() };
}

/**
 * The long free-text answers, all of which are OPTIONAL as of 2026-08-07.
 *
 * Blank passes. A twenty-character floor still applies to anything actually
 * written, which keeps "na" out of the data without turning a question nobody
 * has to answer into one they can fail.
 */
function checkOptionalLongText(value, label) {
  const v = str(value);
  if (!v) return null;
  if (v.length < LIMITS.LONG_TEXT_MIN) {
    return `${label} needs at least ${LIMITS.LONG_TEXT_MIN} characters, or leave it blank.`;
  }
  if (v.length > LIMITS.LONG_TEXT_MAX) {
    return `${label} must be ${LIMITS.LONG_TEXT_MAX} characters or fewer.`;
  }
  return null;
}

/* ─── The validator ────────────────────────────────────────────────────────── */

/**
 * @param {object} body   the submitted payload
 * @param {object} [known] what we already hold for this person — the verified
 *   phone and the email on their lead profile. Only used to reject an
 *   "alternate" that is the same contact detail we already have.
 */
function validateProfilePayload(body = {}, known = {}) {
  const { primaryPhone = null, primaryEmail = null } = known;
  const errors = {};
  const value = {};

  /* — Career status first: it decides what else is required — */

  const careerStatus = str(body.career_status);
  if (!CAREER_STATUSES.includes(careerStatus)) {
    // Without a valid status nothing else can be judged, so stop here rather
    // than emitting a cascade of misleading "required" errors.
    return {
      ok: false,
      errors: { career_status: "Please choose your current career status." },
    };
  }
  value.career_status = careerStatus;

  const { required, forbidden } = REQUIRED_BY_STATUS[careerStatus];
  const isRequired = (field) => required.includes(field);

  /**
   * A field the form hides must not arrive with a value. The portal clears
   * hidden fields on change; anything else is a client that has drifted from
   * this contract, and storing it would leave "studying Computer Science" on
   * someone who told us they are working.
   */
  for (const field of forbidden) {
    if (!isBlank(body[field])) {
      errors[field] = "This question doesn't apply to your career status.";
    }
    value[field] = null;
  }

  /* — Age — */

  const age = Number.parseInt(str(body.age), 10);
  if (isBlank(body.age)) {
    errors.age = "Age is required.";
  } else if (
    !Number.isInteger(age) ||
    age < LIMITS.AGE_MIN ||
    age > LIMITS.AGE_MAX
  ) {
    errors.age = `Age must be a whole number between ${LIMITS.AGE_MIN} and ${LIMITS.AGE_MAX}.`;
  } else {
    value.age = age;
  }

  /* — Gender — */

  const gender = str(body.gender).toLowerCase();
  if (!gender) {
    errors.gender = "Please choose one.";
  } else if (!GENDERS.includes(gender)) {
    errors.gender = "Please choose one of the options.";
  } else {
    value.gender = gender;
  }

  /* — Current city — */

  const city = str(body.current_city);
  if (city.length < LIMITS.CITY_MIN) {
    errors.current_city = "Current city is required.";
  } else if (city.length > LIMITS.CITY_MAX) {
    errors.current_city = `Must be ${LIMITS.CITY_MAX} characters or fewer.`;
  } else {
    value.current_city = city;
  }

  /* — "Other" career status free text — */

  if (careerStatus === CAREER_STATUS.OTHER) {
    const other = str(body.career_status_other);
    if (!other) {
      errors.career_status_other = "Please tell us your current status.";
    } else if (other.length > LIMITS.OTHER_MAX) {
      errors.career_status_other = `Must be ${LIMITS.OTHER_MAX} characters or fewer.`;
    } else {
      value.career_status_other = other;
    }
  }

  /* — Organisation — */

  const org = str(body.org_name);
  if (!org && isRequired("org_name")) {
    errors.org_name =
      careerStatus === CAREER_STATUS.IN_COLLEGE
        ? "College name is required."
        : careerStatus === CAREER_STATUS.CAREER_BREAK
          ? "Previous company is required."
          : "Company name is required.";
  } else if (org.length > LIMITS.ORG_MAX) {
    errors.org_name = `Must be ${LIMITS.ORG_MAX} characters or fewer.`;
  } else {
    value.org_name = org || null;
  }

  /* — Field of study (in_college only) — */

  if (isRequired("field_of_study")) {
    const study = str(body.field_of_study);
    if (!study) {
      errors.field_of_study = "Please tell us what you're studying.";
    } else if (study.length > LIMITS.FIELD_OF_STUDY_MAX) {
      errors.field_of_study = `Must be ${LIMITS.FIELD_OF_STUDY_MAX} characters or fewer.`;
    } else {
      value.field_of_study = study;
    }
  }

  /* — Role: current if working, previous if on a break — */
  // A job title, not an essay. This was a twenty-character-minimum textarea
  // until 2026-08-07; rows written under the old rules are longer than
  // ROLE_MAX and would fail if resubmitted untouched, which is the cost of the
  // change and is why the column stayed TEXT.

  if (isRequired("role_description")) {
    const role = str(body.role_description);
    if (!role) {
      errors.role_description =
        careerStatus === CAREER_STATUS.CAREER_BREAK
          ? "Your previous role is required."
          : "Your current role is required.";
    } else if (role.length > LIMITS.ROLE_MAX) {
      errors.role_description = `Must be ${LIMITS.ROLE_MAX} characters or fewer.`;
    } else {
      value.role_description = role;
    }
  }

  /* — Experience — */
  // Not required for students: "0 years" is the honest answer and making them
  // type it is friction for no information.

  if (isBlank(body.total_experience_years)) {
    if (isRequired("total_experience_years")) {
      errors.total_experience_years = "Total years of experience is required.";
    } else {
      value.total_experience_years = 0;
    }
  } else {
    const exp = Number(str(body.total_experience_years));
    if (
      !Number.isFinite(exp) ||
      exp < LIMITS.EXPERIENCE_MIN ||
      exp > LIMITS.EXPERIENCE_MAX
    ) {
      errors.total_experience_years = `Must be between ${LIMITS.EXPERIENCE_MIN} and ${LIMITS.EXPERIENCE_MAX}.`;
    } else {
      // One decimal place — "2.5 years" is meaningful, "2.4713" is noise.
      value.total_experience_years = Math.round(exp * 10) / 10;
    }
  }

  /* — The two long answers, both optional since 2026-08-07 — */
  // Stored as null rather than "" when blank, so "did they answer?" is one
  // check everywhere rather than two.

  const aboutErr = checkOptionalLongText(
    body.about_studies_job,
    "Tell us about your studies or job",
  );
  if (aboutErr) errors.about_studies_job = aboutErr;
  else value.about_studies_job = str(body.about_studies_job) || null;

  const hobbiesErr = checkOptionalLongText(body.hobbies, "Hobbies and free time");
  if (hobbiesErr) errors.hobbies = hobbiesErr;
  else value.hobbies = str(body.hobbies) || null;

  /* — Links — */
  // Both required as of 2026-08-07. The resume was optional before that, so
  // rows exist with a null resume_url; nothing rewrites them, and their owners
  // are asked for one the next time they open the form.

  if (isBlank(body.linkedin_url)) {
    errors.linkedin_url = "LinkedIn profile is required.";
  } else {
    const li = parseHttpsUrl(body.linkedin_url, { host: "linkedin.com" });
    if (!li.ok) errors.linkedin_url = li.message;
    else value.linkedin_url = li.value;
  }

  if (isBlank(body.resume_url)) {
    errors.resume_url = "Resume link is required.";
  } else {
    const resume = parseHttpsUrl(body.resume_url);
    if (!resume.ok) errors.resume_url = resume.message;
    else value.resume_url = resume.value;
  }

  /* — Roles they're targeting after the programme — */

  const rawRoles = Array.isArray(body.target_roles)
    ? body.target_roles
    : // Tolerate "pm,apm" as well as ["pm","apm"]: the form sends an array, but
      // a comma-joined string is the shape anything else would reach for.
      str(body.target_roles).split(",");

  const roles = [
    ...new Set(rawRoles.map((r) => str(r).toLowerCase()).filter(Boolean)),
  ];

  if (roles.length === 0) {
    errors.target_roles = "Please pick at least one.";
  } else if (roles.length > LIMITS.TARGET_ROLES_MAX) {
    errors.target_roles = "That's more options than exist.";
  } else if (roles.some((r) => !TARGET_ROLE_VALUES.includes(r))) {
    errors.target_roles = "Please choose from the options listed.";
  } else {
    value.target_roles = roles;

    if (roles.includes("other")) {
      const other = str(body.target_role_other);
      if (!other) {
        errors.target_role_other = "Please tell us which role.";
      } else if (other.length > LIMITS.OTHER_MAX) {
        errors.target_role_other = `Must be ${LIMITS.OTHER_MAX} characters or fewer.`;
      } else {
        value.target_role_other = other;
      }
    } else {
      value.target_role_other = null;
    }
  }

  /* — Attribution — */

  const heard = str(body.heard_about_us);
  if (!HEARD_ABOUT_VALUES.includes(heard)) {
    errors.heard_about_us = "Please tell us how you heard about us.";
  } else {
    value.heard_about_us = heard;

    if (heard === "other") {
      const other = str(body.heard_about_us_other);
      if (!other) {
        errors.heard_about_us_other = "Please tell us where you found us.";
      } else if (other.length > LIMITS.OTHER_MAX) {
        errors.heard_about_us_other = `Must be ${LIMITS.OTHER_MAX} characters or fewer.`;
      } else {
        value.heard_about_us_other = other;
      }
    } else {
      value.heard_about_us_other = null;
    }
  }

  /* — Alternate contact details — */
  // Both optional. They exist so a programme manager has a second way through
  // when the verified number stops answering, which means the only rules worth
  // enforcing are "this is usable" and "this is not the one we already have".

  const secondaryEmail = parseEmail(body.secondary_email);
  if (!secondaryEmail.ok) {
    errors.secondary_email = secondaryEmail.message;
  } else if (
    secondaryEmail.value &&
    primaryEmail &&
    secondaryEmail.value === str(primaryEmail).toLowerCase()
  ) {
    errors.secondary_email =
      "That's the email we already have for you — an alternate should be a different one.";
  } else {
    value.secondary_email = secondaryEmail.value;
  }

  const secondaryPhone = digitsOnly(body.secondary_phone);
  if (!secondaryPhone) {
    value.secondary_phone = null;
    value.secondary_country_code = null;
  } else if (secondaryPhone.length < 6 || secondaryPhone.length > 15) {
    errors.secondary_phone = "Please enter a valid phone number.";
  } else if (primaryPhone && phoneKey(secondaryPhone) === phoneKey(primaryPhone)) {
    errors.secondary_phone =
      "That's the number you just verified — an alternate should be a different one.";
  } else {
    value.secondary_phone = secondaryPhone;
    // Default rather than reject: a number with no code is far more likely to
    // be an Indian one typed in a hurry than an attempt at anything.
    const cc = digitsOnly(body.secondary_country_code) || "91";
    value.secondary_country_code = `+${cc}`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value };
}

module.exports = { validateProfilePayload, parseHttpsUrl, parseEmail };
