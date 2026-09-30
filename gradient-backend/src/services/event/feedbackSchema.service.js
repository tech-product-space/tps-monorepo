import {
  FEEDBACK_FIELD_TYPE,
  getFeedbackForm,
  getTeammateField,
} from "../../config/constants/eventFeedbackForms.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;

const isBlank = (value) =>
  value === undefined || value === null || String(value).trim() === "";

const normaliseEmail = (value) => String(value || "").trim().toLowerCase();

/**
 * Validate one scalar answer. Returns an error string, or null.
 */
const validateScalar = (field, value) => {
  if (isBlank(value)) {
    return field.required ? `${field.label} is required.` : null;
  }

  const str = String(value).trim();

  switch (field.type) {
    case FEEDBACK_FIELD_TYPE.RATING: {
      const num = Number(str);
      const min = field.min ?? 1;
      const max = field.max ?? 10;

      if (!Number.isFinite(num) || num < min || num > max) {
        return `${field.label} must be between ${min} and ${max}.`;
      }
      return null;
    }

    case FEEDBACK_FIELD_TYPE.EMAIL:
      return EMAIL_RE.test(str) ? null : `${field.label} must be a valid email.`;

    case FEEDBACK_FIELD_TYPE.URL:
      if (!URL_RE.test(str)) return `${field.label} must be a valid URL.`;
      break;

    case FEEDBACK_FIELD_TYPE.SELECT:
      if (field.options && !field.options.includes(str)) {
        return `${field.label} is not a valid choice.`;
      }
      return null;

    case FEEDBACK_FIELD_TYPE.MULTI_SELECT: {
      const values = Array.isArray(value) ? value : [value];
      const bad = values.find((v) => field.options && !field.options.includes(v));
      return bad ? `${field.label} contains an invalid choice.` : null;
    }

    default:
      break;
  }

  if (field.minLength && str.length < field.minLength) {
    return `${field.label} must be at least ${field.minLength} characters.`;
  }

  if (field.maxLength && str.length > field.maxLength) {
    return `${field.label} must be under ${field.maxLength} characters.`;
  }

  if (field.pattern && !new RegExp(field.pattern).test(str)) {
    return field.patternMessage || `${field.label} is not in the expected format.`;
  }

  return null;
};

/**
 * Validate a submission against the form for this event type, and return a
 * cleaned copy holding only known fields.
 *
 * Validating server-side matters more here than on a typical form: the answers
 * decide who gets a certificate. An unvalidated teammate email is a PDF mailed
 * to nowhere, and a stray key in `responses` becomes a column in the admin
 * export forever.
 */
export const validateFeedbackResponses = (eventType, rawResponses = {}) => {
  const form = getFeedbackForm(eventType);

  if (!form) {
    return { valid: false, errors: ["This event does not collect feedback."] };
  }

  const errors = [];
  const clean = {};

  for (const field of form.fields) {
    const value = rawResponses[field.key];

    if (field.type !== FEEDBACK_FIELD_TYPE.GROUP) {
      const error = validateScalar(field, value);
      if (error) errors.push(error);
      else if (!isBlank(value)) {
        clean[field.key] =
          field.type === FEEDBACK_FIELD_TYPE.MULTI_SELECT
            ? (Array.isArray(value) ? value : [value])
            : String(value).trim();
      }
      continue;
    }

    // Repeatable group — teammates today, but nothing here assumes that.
    const rows = Array.isArray(value) ? value : [];

    // Drop rows the user opened and left empty rather than failing them; an
    // "add another" button that punishes you for clicking it is hostile.
    const filled = rows.filter((row) =>
      field.fields.some((sub) => !isBlank(row?.[sub.key])),
    );

    if (field.min && filled.length < field.min) {
      errors.push(`Add at least ${field.min} ${field.label.toLowerCase()}.`);
    }

    if (field.max && filled.length > field.max) {
      errors.push(`You can add at most ${field.max} ${field.label.toLowerCase()}.`);
    }

    const cleanRows = [];

    filled.forEach((row, index) => {
      const cleanRow = {};

      for (const sub of field.fields) {
        const error = validateScalar(sub, row?.[sub.key]);

        if (error) {
          errors.push(`${field.label} #${index + 1}: ${error}`);
          continue;
        }

        if (isBlank(row?.[sub.key])) continue;

        cleanRow[sub.key] =
          sub.type === FEEDBACK_FIELD_TYPE.EMAIL
            ? normaliseEmail(row[sub.key])
            : String(row[sub.key]).trim();
      }

      cleanRows.push(cleanRow);
    });

    // Two rows naming the same person would otherwise become two certificate
    // rows racing for the same unique key.
    const seen = new Set();
    const deduped = cleanRows.filter((row) => {
      if (!row.email || seen.has(row.email)) return false;
      seen.add(row.email);
      return true;
    });

    if (deduped.length) clean[field.key] = deduped;
  }

  return { valid: errors.length === 0, errors, clean };
};

/**
 * Read the teammates a submission names, with admin corrections applied.
 *
 * **This is the only supported way to read teammate details.** A second reader
 * that goes straight to `responses` reintroduces every typo an admin has since
 * fixed — the corrected address is stored beside the raw answer, not instead of
 * it, precisely so the original submission stays an honest record.
 */
export const readTeammates = (feedback, eventType) => {
  const field = getTeammateField(eventType);
  if (!field) return [];

  const rows = feedback?.responses?.[field.key];
  if (!Array.isArray(rows)) return [];

  const corrections = feedback?.corrections || {};

  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const originalEmail = normaliseEmail(row?.email);
    if (!originalEmail) continue;

    const correction = corrections[originalEmail];

    const email = correction?.email
      ? normaliseEmail(correction.email)
      : originalEmail;

    const name = correction?.name || row?.name;

    // A teammate with no name cannot have a certificate rendered for them.
    if (!name || seen.has(email)) continue;

    seen.add(email);

    out.push({
      name: String(name).trim(),
      email,
      phone: row?.phone || null,
      countryCode: row?.countryCode || null,
      wasCorrected: Boolean(correction),
      originalEmail: correction ? originalEmail : null,
    });
  }

  return out;
};
