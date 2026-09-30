"use strict";

/**
 * Replaces {{key}} placeholders in a template string with values from a scope
 * object. Missing values become empty strings. Dotted paths still work for
 * future fields, but the canonical convention is flat names:
 *
 *   interpolate("Hi {{name}}", { name: "Alice" })           → "Hi Alice"
 *   interpolate("Hi {{lead.name}}", { lead: { name: "A"}}) → "Hi A"   (legacy)
 */
function interpolate(template, scope) {
  if (typeof template !== "string" || !template) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path
      .split(".")
      .reduce((acc, key) => (acc == null ? acc : acc[key]), scope);
    return value == null ? "" : String(value);
  });
}

/**
 * Build the scope object used for interpolation, derived from the enrollment.
 * Phase 2 surfaces lead name/email/phone via the snapshot fields. Keys are
 * flat: {{name}}, {{email}}, {{phone}}. A `lead` namespace is kept for
 * backward compatibility with any pre-existing templates.
 */
function buildScope(enrollment) {
  const name = enrollment.lead_name_snapshot || "";
  const email = enrollment.lead_email_snapshot || "";
  const phone = enrollment.lead_phone_snapshot || "";
  return {
    name,
    email,
    phone,
    lead: { name, email, phone },
  };
}

module.exports = { interpolate, buildScope };
