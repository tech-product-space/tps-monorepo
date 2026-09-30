const { Op, fn, col } = require("sequelize");
const {
  sequelize,
  ExpenseForm,
  ExpenseFormCategory,
  ExpenseTeam,
  ExpenseCategory,
  ExpenseSubcategory,
  Expense,
} = require("../../models");
const {
  generateUniqueSlug,
  normalizeFieldConfig,
} = require("../../service/expense/expenseFormService");

const formInclude = [
  { model: ExpenseTeam, as: "team", attributes: ["id", "name", "is_active"] },
  {
    model: ExpenseFormCategory,
    as: "allowedCategories",
    include: [
      { model: ExpenseCategory, as: "category", attributes: ["id", "name"] },
      { model: ExpenseSubcategory, as: "subcategory", attributes: ["id", "name"] },
    ],
  },
];

/**
 * Normalise the incoming allow-list and (re)write it for a form. Accepts
 *   allowedCategories: [{ category_id, subcategory_ids?: string[] }]
 * where an empty/absent subcategory_ids means "the whole category is allowed".
 */
async function replaceAllowList(formId, allowedCategories, transaction) {
  await ExpenseFormCategory.destroy({ where: { form_id: formId }, transaction });
  if (!Array.isArray(allowedCategories)) return;

  const rows = [];
  for (const entry of allowedCategories) {
    if (!entry || !entry.category_id) continue;
    const subIds = Array.isArray(entry.subcategory_ids) ? entry.subcategory_ids : [];
    if (subIds.length === 0) {
      rows.push({ form_id: formId, category_id: entry.category_id, subcategory_id: null });
    } else {
      for (const subId of subIds) {
        rows.push({ form_id: formId, category_id: entry.category_id, subcategory_id: subId });
      }
    }
  }
  if (rows.length) await ExpenseFormCategory.bulkCreate(rows, { transaction });
}

// Map raw allow-list rows back into the grouped shape the editor sends.
function groupAllowList(rows = []) {
  const map = new Map();
  for (const r of rows) {
    let entry = map.get(r.category_id);
    if (!entry) {
      entry = { category_id: r.category_id, category: r.category, subcategory_ids: [] };
      map.set(r.category_id, entry);
    }
    if (r.subcategory_id) entry.subcategory_ids.push(r.subcategory_id);
  }
  return Array.from(map.values());
}

const listForms = async (req, res) => {
  try {
    const forms = await ExpenseForm.findAll({
      include: formInclude,
      order: [["createdAt", "DESC"]],
    });

    // Submission counts in one grouped query, then merged in.
    const counts = await Expense.findAll({
      attributes: ["expense_form_id", [fn("COUNT", col("id")), "count"]],
      where: { expense_form_id: { [Op.ne]: null } },
      group: ["expense_form_id"],
      raw: true,
    });
    const countMap = Object.fromEntries(
      counts.map((c) => [c.expense_form_id, Number(c.count)])
    );

    const data = forms.map((f) => {
      const json = f.toJSON();
      json.submissionCount = countMap[f.id] || 0;
      json.allowedCategories = groupAllowList(json.allowedCategories);
      json.field_config = normalizeFieldConfig(json.field_config);
      return json;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error listing forms:", error);
    res.status(500).json({ error: "Failed to fetch forms", details: error.message });
  }
};

const getForm = async (req, res) => {
  try {
    const form = await ExpenseForm.findByPk(req.params.id, { include: formInclude });
    if (!form) return res.status(404).json({ message: "Form not found" });

    const json = form.toJSON();
    json.allowedCategories = groupAllowList(json.allowedCategories);
    json.field_config = normalizeFieldConfig(json.field_config);
    res.status(200).json({ success: true, data: json });
  } catch (error) {
    console.error("Error fetching form:", error);
    res.status(500).json({ error: "Failed to fetch form", details: error.message });
  }
};

const createForm = async (req, res) => {
  const {
    name,
    team_id,
    instructions,
    field_config,
    is_active,
    allowedCategories,
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: "'name' is required" });
  if (!team_id) return res.status(400).json({ error: "'team_id' is required" });

  try {
    const team = await ExpenseTeam.findByPk(team_id);
    if (!team) return res.status(400).json({ error: "Team not found" });

    const slug = await generateUniqueSlug(name);

    const form = await sequelize.transaction(async (transaction) => {
      const created = await ExpenseForm.create(
        {
          name: name.trim(),
          team_id,
          slug,
          instructions: instructions || null,
          field_config: normalizeFieldConfig(field_config),
          is_active: is_active !== false,
          created_by: req.user?.id || req.body.created_by || null,
        },
        { transaction }
      );
      await replaceAllowList(created.id, allowedCategories, transaction);
      return created;
    });

    const withRelations = await ExpenseForm.findByPk(form.id, { include: formInclude });
    const json = withRelations.toJSON();
    json.allowedCategories = groupAllowList(json.allowedCategories);
    json.field_config = normalizeFieldConfig(json.field_config);
    res.status(201).json({ success: true, data: json });
  } catch (error) {
    console.error("Error creating form:", error);
    res.status(500).json({ error: "Failed to create form", details: error.message });
  }
};

const updateForm = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    team_id,
    instructions,
    field_config,
    is_active,
    allowedCategories,
  } = req.body;

  try {
    const form = await ExpenseForm.findByPk(id);
    if (!form) return res.status(404).json({ message: "Form not found" });

    await sequelize.transaction(async (transaction) => {
      if (name !== undefined) form.name = name.trim();
      if (team_id !== undefined) form.team_id = team_id;
      if (instructions !== undefined) form.instructions = instructions || null;
      if (field_config !== undefined) form.field_config = normalizeFieldConfig(field_config);
      if (is_active !== undefined) form.is_active = !!is_active;
      await form.save({ transaction });

      if (allowedCategories !== undefined) {
        await replaceAllowList(form.id, allowedCategories, transaction);
      }
    });

    const withRelations = await ExpenseForm.findByPk(id, { include: formInclude });
    const json = withRelations.toJSON();
    json.allowedCategories = groupAllowList(json.allowedCategories);
    json.field_config = normalizeFieldConfig(json.field_config);
    res.status(200).json({ success: true, data: json });
  } catch (error) {
    console.error("Error updating form:", error);
    res.status(500).json({ error: "Failed to update form", details: error.message });
  }
};

const toggleForm = async (req, res) => {
  try {
    const form = await ExpenseForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ message: "Form not found" });

    form.is_active = !form.is_active;
    await form.save();
    res.status(200).json({ success: true, data: form });
  } catch (error) {
    console.error("Error toggling form:", error);
    res.status(500).json({ error: "Failed to toggle form", details: error.message });
  }
};

// Rotate the public link (invalidates the old one).
const regenerateLink = async (req, res) => {
  try {
    const form = await ExpenseForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ message: "Form not found" });

    form.slug = await generateUniqueSlug(form.name);
    await form.save();
    res.status(200).json({ success: true, data: form });
  } catch (error) {
    console.error("Error regenerating link:", error);
    res.status(500).json({ error: "Failed to regenerate link", details: error.message });
  }
};

const deleteForm = async (req, res) => {
  try {
    const form = await ExpenseForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ message: "Form not found" });

    await form.destroy(); // soft delete (paranoid). Past expenses keep their FK.
    res.status(200).json({ success: true, message: "Form deleted" });
  } catch (error) {
    console.error("Error deleting form:", error);
    res.status(500).json({ error: "Failed to delete form", details: error.message });
  }
};

module.exports = {
  listForms,
  getForm,
  createForm,
  updateForm,
  toggleForm,
  regenerateLink,
  deleteForm,
};
