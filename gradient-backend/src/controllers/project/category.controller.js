import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const { Project, ProjectCategory } = db;

/** Counts every project filed here, drafts included — this is an admin screen. */
const resolveProjectCounts = async (categoryIds) => {
  if (!categoryIds.length) return {};

  const rows = await Project.findAll({
    attributes: [
      "categoryId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    where: { categoryId: { [Op.in]: categoryIds } },
    group: ["categoryId"],
    raw: true,
  });

  return Object.fromEntries(rows.map((r) => [r.categoryId, Number(r.count)]));
};

export const listCategories = asyncWrapper(async (req, res) => {
  const categories = await ProjectCategory.findAll({
    order: [
      ["order", "ASC"],
      ["name", "ASC"],
    ],
  });

  const counts = await resolveProjectCounts(categories.map((c) => c.id));

  return res.status(200).json({
    success: true,
    data: categories.map((category) => ({
      ...category.toJSON(),
      projectCount: counts[category.id] ?? 0,
    })),
  });
});

export const createCategory = asyncWrapper(async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: "Name is required" });
  }

  const category = await ProjectCategory.create({
    name,
    slug: req.body.slug,
    thumbnail: req.body.thumbnail,
    description: req.body.description,
    order: req.body.order ?? 0,
    isActive: req.body.isActive ?? true,
  });

  return res.status(201).json({ success: true, data: category });
});

export const updateCategory = asyncWrapper(async (req, res) => {
  const category = await ProjectCategory.findByPk(req.params.id);

  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }

  const updates = Object.fromEntries(
    Object.entries({
      name: req.body.name,
      slug: req.body.slug,
      thumbnail: req.body.thumbnail,
      description: req.body.description,
      order: req.body.order,
      isActive: req.body.isActive,
    }).filter(([, v]) => v !== undefined),
  );

  await category.update(updates);

  req.activity?.set({ entityLabel: category.name });

  return res.status(200).json({ success: true, data: category });
});

/**
 * Takes the whole ordered id array, not a pair of indices.
 *
 * A drag-and-drop list already knows its final order; sending that is one
 * round trip and is idempotent on retry. Sending "moved item 3 to position 5"
 * makes the server reconstruct a list it cannot see, and a dropped request
 * leaves the two out of step with no way to tell.
 */
export const reorderCategories = asyncWrapper(async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || !ids.length) {
    return res
      .status(400)
      .json({ success: false, message: "ids must be a non-empty array" });
  }

  await db.sequelize.transaction(async (transaction) => {
    await Promise.all(
      ids.map((id, index) =>
        ProjectCategory.update(
          { order: index },
          { where: { id }, transaction },
        ),
      ),
    );
  });

  req.activity?.set({ metadata: { affectedCount: ids.length } });

  return res
    .status(200)
    .json({ success: true, message: "Categories reordered" });
});

/**
 * Deleting a category is `SET NULL`, not a cascade.
 *
 * The projects survive and become uncategorised — losing a shelf label must not
 * delete what is on the shelf. The count comes back so the panel's confirm
 * dialog can say "12 projects will become uncategorised" rather than "are you
 * sure".
 */
export const deleteCategory = asyncWrapper(async (req, res) => {
  const category = await ProjectCategory.findByPk(req.params.id);

  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }

  const uncategorisedProjects = await Project.count({
    where: { categoryId: category.id },
  });

  req.activity?.set({
    entityLabel: category.name,
    metadata: { uncategorisedProjects },
  });

  await category.destroy();

  return res.status(200).json({
    success: true,
    message: "Category deleted successfully",
    data: { uncategorisedProjects },
  });
});
