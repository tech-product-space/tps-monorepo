const { ExpenseCategory, ExpenseSubcategory } = require("../../models");

/* ------------------------------- categories ------------------------------- */

// List categories with their active subcategories nested. Pass ?all=true to
// include archived (is_active=false) ones, e.g. for an admin management view.
const listCategories = async (req, res) => {
  try {
    const includeArchived = req.query.all === "true";
    const where = includeArchived ? {} : { is_active: true };

    const categories = await ExpenseCategory.findAll({
      where,
      include: [
        {
          model: ExpenseSubcategory,
          as: "subcategories",
          where: includeArchived ? undefined : { is_active: true },
          required: false,
        },
      ],
      order: [
        ["name", "ASC"],
        [{ model: ExpenseSubcategory, as: "subcategories" }, "name", "ASC"],
      ],
    });

    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error("Error listing categories:", error);
    res.status(500).json({ error: "Failed to fetch categories", details: error.message });
  }
};

const createCategory = async (req, res) => {
  const { name, type } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "'name' is required" });
  }

  try {
    const category = await ExpenseCategory.create({
      name: name.trim(),
      type: type || "expense",
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Failed to create category", details: error.message });
  }
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, type, is_active } = req.body;

  try {
    const category = await ExpenseCategory.findByPk(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (name !== undefined) category.name = name.trim();
    if (type !== undefined) category.type = type;
    if (is_active !== undefined) category.is_active = is_active;
    await category.save();

    res.status(200).json({ success: true, data: category });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Failed to update category", details: error.message });
  }
};

// Soft-archive: keep the row (historical expenses still reference it) but hide
// it from pickers. Its subcategories are archived along with it.
const deleteCategory = async (req, res) => {
  const { id } = req.params;

  try {
    const category = await ExpenseCategory.findByPk(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    category.is_active = false;
    await category.save();
    await ExpenseSubcategory.update({ is_active: false }, { where: { category_id: id } });

    res.status(200).json({ success: true, message: "Category archived" });
  } catch (error) {
    console.error("Error archiving category:", error);
    res.status(500).json({ error: "Failed to archive category", details: error.message });
  }
};

/* ----------------------------- subcategories ------------------------------ */

const createSubcategory = async (req, res) => {
  const { id: categoryId } = req.params; // POST /categories/:id/subcategories
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "'name' is required" });
  }

  try {
    const category = await ExpenseCategory.findByPk(categoryId);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const subcategory = await ExpenseSubcategory.create({
      category_id: categoryId,
      name: name.trim(),
    });
    res.status(201).json({ success: true, data: subcategory });
  } catch (error) {
    console.error("Error creating subcategory:", error);
    res.status(500).json({ error: "Failed to create subcategory", details: error.message });
  }
};

const updateSubcategory = async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body;

  try {
    const subcategory = await ExpenseSubcategory.findByPk(id);
    if (!subcategory) return res.status(404).json({ message: "Subcategory not found" });

    if (name !== undefined) subcategory.name = name.trim();
    if (is_active !== undefined) subcategory.is_active = is_active;
    await subcategory.save();

    res.status(200).json({ success: true, data: subcategory });
  } catch (error) {
    console.error("Error updating subcategory:", error);
    res.status(500).json({ error: "Failed to update subcategory", details: error.message });
  }
};

const deleteSubcategory = async (req, res) => {
  const { id } = req.params;

  try {
    const subcategory = await ExpenseSubcategory.findByPk(id);
    if (!subcategory) return res.status(404).json({ message: "Subcategory not found" });

    subcategory.is_active = false;
    await subcategory.save();

    res.status(200).json({ success: true, message: "Subcategory archived" });
  } catch (error) {
    console.error("Error archiving subcategory:", error);
    res.status(500).json({ error: "Failed to archive subcategory", details: error.message });
  }
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
};
