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

  for (const field of fieldData) {
    if (!field?.values?.length) continue;

    const key = field.name.toLowerCase();
    const value = field.values[0];

    if (!value) continue;

    if (NAME_KEYS.has(key)) {
      if (key === "first_name") firstName = value;
      else if (key === "last_name") lastName = value;
      else name = value;
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
  }

  if (!name && (firstName || lastName)) {
    name = `${firstName || ""} ${lastName || ""}`.trim();
  }

  return { name, email, phone };
}


module.exports = {
  normalizeMetaLeadFields
}