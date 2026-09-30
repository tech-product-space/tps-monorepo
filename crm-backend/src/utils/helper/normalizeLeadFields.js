const NAME_KEYS = new Set([
  "full_name",
  "name",
  "first_name",
  "last_name",
]);

const EMAIL_KEYS = new Set([
  "email",
  "email_address",
]);

const PHONE_KEYS = new Set([
  "phone",
  "phone_number",
  "mobile_number",
  "mobile",
]);

function normalizeMetaLeadFields(fieldData = []) {
  let name = null;
  let email = null;
  let phone = null;

  let firstName = null;
  let lastName = null;

  const extraFields = {};

  for (const field of fieldData) {
    if (!field?.values?.length) continue;

    const key = field.name.toLowerCase();
    const value = field.values[0];

    if (!value) continue;

    // NAME
    if (NAME_KEYS.has(key)) {
      if (key === "first_name") firstName = value;
      else if (key === "last_name") lastName = value;
      else name = value;
      continue;
    }

    // EMAIL
    if (!email && EMAIL_KEYS.has(key)) {
      email = value;
      continue;
    }

    // PHONE
    if (!phone && PHONE_KEYS.has(key)) {
      phone = value;
      continue;
    }

    // EVERYTHING ELSE
    extraFields[key] = value;
  }

  if (!name && (firstName || lastName)) {
    name = `${firstName || ""} ${lastName || ""}`.trim();
  }

  return {
    name,
    email,
    phone,
    extraFields,
  };
}

module.exports = {
  normalizeMetaLeadFields,
};