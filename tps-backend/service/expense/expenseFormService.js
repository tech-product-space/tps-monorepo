const crypto = require("crypto");
const {
  ExpenseForm,
  ExpenseFormCategory,
  ExpenseCategory,
  ExpenseSubcategory,
} = require("../../models");
const { FORM_FIELDS, DEFAULT_FIELD_CONFIG } = require("../../constants/expenses");

/* ------------------------------ field config ------------------------------ */

// Coerce any stored/incoming field_config into a complete, valid object: every
// known field present, booleans only, and a disabled field can't be required.
function normalizeFieldConfig(input) {
  const out = {};
  for (const key of FORM_FIELDS) {
    const def = DEFAULT_FIELD_CONFIG[key];
    const v = input && typeof input === "object" ? input[key] : null;
    const enabled = v && typeof v.enabled === "boolean" ? v.enabled : def.enabled;
    const required = v && typeof v.required === "boolean" ? v.required : def.required;
    out[key] = { enabled, required: enabled ? required : false };
  }
  return out;
}

/* --------------------------------- slugs ---------------------------------- */

// Turn a form name into a URL-safe base, then append a short random suffix so
// the public link is unguessable and collisions are practically impossible.
function slugifyName(name) {
  const base = String(name || "form")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "form";
}

async function generateUniqueSlug(name) {
  // A handful of attempts is more than enough given the 5-byte random suffix.
  for (let i = 0; i < 5; i++) {
    const suffix = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    const slug = `${slugifyName(name)}-${suffix}`;
    const existing = await ExpenseForm.findOne({ where: { slug }, paranoid: false });
    if (!existing) return slug;
  }
  // Extremely unlikely fallback.
  return `form-${crypto.randomBytes(8).toString("hex")}`;
}

/* ------------------------------ allow-list -------------------------------- */

// Collapse a form's raw allow-list rows into a per-category descriptor:
//   { wholeCategory: boolean, subIds: Set<string> }
// `wholeCategory` means a row with subcategory_id = null exists (all subs allowed).
function indexAllowList(rows) {
  const byCategory = new Map();
  for (const row of rows) {
    let entry = byCategory.get(row.category_id);
    if (!entry) {
      entry = { wholeCategory: false, subIds: new Set() };
      byCategory.set(row.category_id, entry);
    }
    if (row.subcategory_id) entry.subIds.add(row.subcategory_id);
    else entry.wholeCategory = true;
  }
  return byCategory;
}

/**
 * Build the category/subcategory tree a public form should render, honouring
 * both the form's allow-list and the master is_active flags. Archived master
 * categories/subcategories are dropped even if still referenced by the form.
 */
async function buildAllowedCategoryTree(formId) {
  const rows = await ExpenseFormCategory.findAll({ where: { form_id: formId } });
  const index = indexAllowList(rows);
  if (index.size === 0) return [];

  const categories = await ExpenseCategory.findAll({
    where: { id: Array.from(index.keys()), is_active: true },
    include: [
      {
        model: ExpenseSubcategory,
        as: "subcategories",
        where: { is_active: true },
        required: false,
      },
    ],
    order: [
      ["name", "ASC"],
      [{ model: ExpenseSubcategory, as: "subcategories" }, "name", "ASC"],
    ],
  });

  return categories.map((c) => {
    const entry = index.get(c.id);
    const subs = (c.subcategories || []).filter(
      (s) => entry.wholeCategory || entry.subIds.has(s.id)
    );
    return {
      id: c.id,
      name: c.name,
      subcategories: subs.map((s) => ({ id: s.id, name: s.name })),
    };
  });
}

/**
 * Validate a submitter's category/subcategory choice against a form's allow-list.
 * Returns { ok: true } or { ok: false, error }.
 */
async function validateSelection(formId, categoryId, subcategoryId) {
  if (!categoryId) return { ok: false, error: "'category_id' is required" };

  const rows = await ExpenseFormCategory.findAll({ where: { form_id: formId } });
  const index = indexAllowList(rows);
  const entry = index.get(categoryId);
  if (!entry) return { ok: false, error: "Selected category is not allowed on this form" };

  // Category must still be active in the master list.
  const category = await ExpenseCategory.findOne({
    where: { id: categoryId, is_active: true },
  });
  if (!category) return { ok: false, error: "Selected category is unavailable" };

  if (subcategoryId) {
    if (!entry.wholeCategory && !entry.subIds.has(subcategoryId)) {
      return { ok: false, error: "Selected subcategory is not allowed on this form" };
    }
    const sub = await ExpenseSubcategory.findOne({
      where: { id: subcategoryId, category_id: categoryId, is_active: true },
    });
    if (!sub) return { ok: false, error: "Selected subcategory is unavailable" };
  }

  return { ok: true };
}

module.exports = {
  slugifyName,
  generateUniqueSlug,
  buildAllowedCategoryTree,
  validateSelection,
  normalizeFieldConfig,
};
