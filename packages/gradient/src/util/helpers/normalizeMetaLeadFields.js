/**
 * Turns Facebook's `field_data` array into name / email / phone plus whatever
 * else the form asked.
 *
 * Graph returns answers as `[{ name: "full_name", values: ["Priya"] }, ...]`,
 * and the key depends on how the form was built — a form asking for a name can
 * come back as `full_name`, as `name`, or as `first_name` + `last_name` in two
 * separate entries. Marketing builds these forms in the Meta UI without telling
 * anyone, so the mapping has to be tolerant rather than exact.
 *
 * Anything unrecognised is kept in `extraFields` rather than dropped. The
 * interesting question on a real lead form is usually the fourth one — "which
 * programme are you interested in", "when do you want to start" — and throwing
 * it away means it is gone for good.
 */

const NAME_KEYS = new Set(["full_name", "name", "your_name"]);
const FIRST_NAME_KEYS = new Set(["first_name", "firstname"]);
const LAST_NAME_KEYS = new Set(["last_name", "lastname"]);

const EMAIL_KEYS = new Set(["email", "email_address", "work_email"]);

const PHONE_KEYS = new Set([
  "phone",
  "phone_number",
  "mobile",
  "mobile_number",
  "contact_number",
  "whatsapp_number",
]);

/**
 * Cheap shape check, not RFC 5322.
 *
 * `meta_leads.email` has no `isEmail` validator — a Facebook payload should
 * never be able to reject its own row — so this decides whether a value is
 * usable as an address. A value that fails stays in `rawPayload`, where it is
 * still visible on the lead detail screen.
 */
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * @param   {Array<{name: string, values: string[]}>} fieldData
 * @returns {{ name: string|null, email: string|null, phone: string|null, extraFields: object }}
 */
export const normalizeMetaLeadFields = (fieldData = []) => {
  let name = null;
  let email = null;
  let phone = null;

  let firstName = null;
  let lastName = null;

  const extraFields = {};

  for (const field of Array.isArray(fieldData) ? fieldData : []) {
    if (!field?.name || !field?.values?.length) continue;

    const key = String(field.name).toLowerCase();
    const value = typeof field.values[0] === "string"
      ? field.values[0].trim()
      : field.values[0];

    if (value === "" || value === null || value === undefined) continue;

    if (NAME_KEYS.has(key)) {
      name = name || value;
      continue;
    }

    if (FIRST_NAME_KEYS.has(key)) {
      firstName = firstName || value;
      continue;
    }

    if (LAST_NAME_KEYS.has(key)) {
      lastName = lastName || value;
      continue;
    }

    if (!email && EMAIL_KEYS.has(key)) {
      email = value;
      continue;
    }

    if (!phone && PHONE_KEYS.has(key)) {
      phone = value;
      continue;
    }

    // Multi-select answers come back with more than one value; keep them all.
    extraFields[key] = field.values.length > 1 ? field.values : value;
  }

  if (!name && (firstName || lastName)) {
    name = [firstName, lastName].filter(Boolean).join(" ").trim();
  }

  const normalisedEmail =
    email && looksLikeEmail(email) ? email.toLowerCase() : null;

  // A malformed address is not silently lost — it is demoted to an ordinary
  // answer, so the row still shows what the person typed.
  if (email && !normalisedEmail) extraFields.email_raw = email;

  return {
    name: name ? String(name).slice(0, 255) : null,
    email: normalisedEmail ? normalisedEmail.slice(0, 255) : null,
    phone: phone ? String(phone) : null,
    extraFields,
  };
};

export default normalizeMetaLeadFields;
