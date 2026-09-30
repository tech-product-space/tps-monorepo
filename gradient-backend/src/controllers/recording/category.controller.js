import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const { Recording, RecordingCategory } = db;

/**
 * The chip catalogue behind /recordings.
 *
 * Small on purpose. The one thing worth care here is delete: it is
 * `ON DELETE SET NULL`, so the recordings survive but drop out of every chip,
 * and the panel cannot ask that question honestly without a count.
 */

export const listCategories = asyncWrapper(async (req, res) => {
  const categories = await RecordingCategory.findAll({
    order: [
      ["order", "ASC"],
      ["name", "ASC"],
    ],
  });

  // Grouped once rather than per row. Feeds the delete confirmation, which has
  // to say how many recordings become uncategorised — "are you sure?" is not
  // enough information to answer with.
  const counts = await Recording.findAll({
    attributes: [
      "categoryId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    where: { categoryId: { [Op.ne]: null } },
    group: ["categoryId"],
    raw: true,
  });

  const countByCategory = Object.fromEntries(
    counts.map((row) => [row.categoryId, Number(row.count)]),
  );

  return res.status(200).json({
    success: true,
    data: categories.map((category) => ({
      ...category.toJSON(),
      recordingCount: countByCategory[category.id] ?? 0,
    })),
  });
});

export const createCategory = asyncWrapper(async (req, res) => {
  const { name, slug, description, isActive } = req.body ?? {};

  if (!name) {
    return res.status(400).json({ success: false, message: "Name is required" });
  }

  // Appended to the end of the chip row. Anything else would silently push an
  // existing chip sideways, which is not what "add a category" means.
  const last = await RecordingCategory.max("order");

  const category = await RecordingCategory.create({
    name,
    slug,
    description,
    isActive: isActive ?? true,
    order: Number.isFinite(last) ? last + 1 : 1,
  });

  return res.status(201).json({ success: true, data: category });
});

export const updateCategory = asyncWrapper(async (req, res) => {
  const category = await RecordingCategory.findByPk(req.params.id);

  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }

  const { name, slug, description, isActive } = req.body ?? {};

  await category.update({
    ...(name !== undefined && { name }),
    ...(slug !== undefined && { slug }),
    ...(description !== undefined && { description }),
    ...(isActive !== undefined && { isActive }),
  });

  req.activity?.set({ entityLabel: category.name });

  return res.status(200).json({ success: true, data: category });
});

/**
 * One write for the whole drag, not one per chip.
 *
 * Per-row `order` writes interleave under two admins and leave gaps or
 * duplicates; the order of a list is a single fact about the list.
 */
export const reorderCategories = asyncWrapper(async (req, res) => {
  const { ids } = req.body ?? {};

  if (!Array.isArray(ids) || !ids.length) {
    return res
      .status(400)
      .json({ success: false, message: "ids must be a non-empty array" });
  }

  await db.sequelize.transaction(async (transaction) => {
    await Promise.all(
      ids.map((id, index) =>
        RecordingCategory.update(
          { order: index + 1 },
          { where: { id }, transaction },
        ),
      ),
    );
  });

  req.activity?.set({ metadata: { affectedCount: ids.length } });

  const categories = await RecordingCategory.findAll({
    order: [["order", "ASC"]],
  });

  return res.status(200).json({ success: true, data: categories });
});

export const deleteCategory = asyncWrapper(async (req, res) => {
  const category = await RecordingCategory.findByPk(req.params.id);

  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }

  const affected = await Recording.count({ where: { categoryId: category.id } });

  req.activity?.set({
    entityLabel: category.name,
    metadata: { affectedCount: affected },
  });

  // The FK is SET NULL, so this does not cascade — the recordings stay and
  // simply become uncategorised. Reported back so the panel can say so rather
  // than implying nothing happened.
  await category.destroy();

  return res.status(200).json({
    success: true,
    message: "Category deleted",
    data: { uncategorisedRecordings: affected },
  });
});
