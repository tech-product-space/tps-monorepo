import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { buildChanges, snapshot } from "../../util/helpers/activityDiff.js";
import {
  readBatch,
  readTitleAndSlug,
  uniqueSlug,
} from "../../util/helpers/importBatch.js";

const { Project, ProjectStep } = db;

/** Titles only — a step list never needs every step's ProseMirror document. */
const LIST_ATTRS = [
  "id",
  "projectId",
  "title",
  "slug",
  "order",
  "isPublished",
  "createdAt",
  "updatedAt",
];

const requireProject = async (projectId, res) => {
  const project = await Project.findByPk(projectId, {
    attributes: ["id", "title"],
  });

  if (!project) {
    res.status(404).json({ success: false, message: "Project not found" });
    return null;
  }

  return project;
};

export const listSteps = asyncWrapper(async (req, res) => {
  const project = await requireProject(req.params.projectId, res);
  if (!project) return;

  const steps = await ProjectStep.findAll({
    where: { projectId: project.id },
    attributes: LIST_ATTRS,
    order: [
      ["order", "ASC"],
      ["createdAt", "ASC"],
    ],
  });

  return res.status(200).json({ success: true, data: steps });
});

export const getStepById = asyncWrapper(async (req, res) => {
  const step = await ProjectStep.findByPk(req.params.id);

  if (!step) {
    return res.status(404).json({ success: false, message: "Step not found" });
  }

  return res.status(200).json({ success: true, data: step });
});

export const checkStepSlugAvailability = asyncWrapper(async (req, res) => {
  const { slug, excludeId } = req.query;

  if (!slug) {
    return res.status(400).json({ success: false, message: "slug is required" });
  }

  // Scoped to the project: the URL is already scoped by it, and a global check
  // would tell an admin that "setup" is taken because another project uses it.
  const where = { projectId: req.params.projectId, slug };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const existing = await ProjectStep.findOne({ where, attributes: ["id"] });

  return res.status(200).json({ success: true, data: { available: !existing } });
});

/** Appends to the end of the guide — the order a guide is written in. */
const nextOrder = async (projectId) => {
  const max = await ProjectStep.max("order", { where: { projectId } });

  return Number.isFinite(max) ? max + 1 : 0;
};

export const createStep = asyncWrapper(async (req, res) => {
  const project = await requireProject(req.params.projectId, res);
  if (!project) return;

  const { title } = req.body;

  if (!title) {
    return res
      .status(400)
      .json({ success: false, message: "Title is required" });
  }

  const step = await ProjectStep.create({
    projectId: project.id,
    title,
    slug: req.body.slug,
    content: req.body.content ?? {},
    seo: req.body.seo ?? {},
    order: req.body.order ?? (await nextOrder(project.id)),
  });

  req.activity?.set({ entityLabel: step.title });

  return res.status(201).json({ success: true, data: step });
});

/**
 * Bulk import — the "Import steps" dialog, which splits an uploaded .docx into
 * one step per heading.
 *
 * The document never reaches this endpoint. The panel converts it to
 * ProseMirror JSON in the browser, because that conversion has to upload the
 * embedded images through the existing upload endpoint and produce exactly the
 * document shape `TiptapEditor` round-trips — doing it again server-side would
 * be a second parser to keep in step with the first.
 *
 * Fail-closed like the lesson importer: one bad row rejects the batch naming
 * the row, rather than half-importing and leaving the admin to work out what
 * landed. Imported steps are drafts, so a bad import shows nobody anything.
 */
export const importSteps = asyncWrapper(async (req, res) => {
  const project = await requireProject(req.params.projectId, res);
  if (!project) return;

  const { items, error: batchError } = readBatch(req.body, "steps");
  if (batchError) {
    return res.status(400).json({ success: false, message: batchError });
  }

  // Steps carry a real unique index on (projectId, slug), so this is not the
  // only thing keeping them apart — but resolving collisions here is what lets
  // a 40-step import land in one go instead of failing on step 12.
  const existing = await ProjectStep.findAll({
    where: { projectId: project.id },
    attributes: ["slug"],
  });
  const taken = new Set(existing.map((step) => step.slug));

  const rows = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = `Step ${i + 1}`;

    const { title, slug, error } = readTitleAndSlug(item, label);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    if (
      item.content !== undefined &&
      (typeof item.content !== "object" || Array.isArray(item.content))
    ) {
      return res.status(400).json({
        success: false,
        message: `${label} has "content" that isn't a ProseMirror document object.`,
      });
    }

    rows.push({
      projectId: project.id,
      title,
      slug: uniqueSlug(slug, taken),
      content: item.content || {},
      seo: item.seo && typeof item.seo === "object" ? item.seo : {},
      // Drafts. An import is a first pass, not a publish.
      isPublished: false,
    });
  }

  // Appended after whatever is already there, in document order.
  const start = await nextOrder(project.id);
  rows.forEach((row, i) => {
    row.order = start + i;
  });

  const created = await db.sequelize.transaction((transaction) =>
    ProjectStep.bulkCreate(rows, { transaction }),
  );

  req.activity?.set({
    entityLabel: project.title,
    metadata: { affectedCount: created.length },
  });

  return res.status(201).json({
    success: true,
    message: `Imported ${created.length} step${created.length === 1 ? "" : "s"} as drafts.`,
    data: created,
  });
});

const DIFF_FIELDS = ["title", "slug", "content", "isPublished"];

/** The same shape the model's `beforeValidate` hook derives. */
const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const updateStep = asyncWrapper(async (req, res) => {
  const step = await ProjectStep.findByPk(req.params.id);

  if (!step) {
    return res.status(404).json({ success: false, message: "Step not found" });
  }

  /**
   * The slug is editable, and normalised rather than trusted.
   *
   * It goes in a public URL, so "My Step!" has to become `my-step` before it is
   * stored — otherwise the admin sees one thing in the field and a percent-
   * encoded other thing in the address bar.
   *
   * The collision is caught here with a message that names the problem. The
   * unique index would reject it anyway and the error middleware would turn
   * that into a 409, but "slug must be unique" is not something an admin can
   * act on without being told it is *this project's* other step that has it.
   */
  if (req.body.slug !== undefined) {
    const slug = slugify(req.body.slug);

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "A slug needs at least one letter or number",
      });
    }

    const clash = await ProjectStep.findOne({
      where: {
        projectId: step.projectId,
        slug,
        id: { [Op.ne]: step.id },
      },
      attributes: ["id", "title"],
    });

    if (clash) {
      return res.status(409).json({
        success: false,
        message: `"${clash.title}" in this guide already uses /${slug}.`,
      });
    }

    req.body.slug = slug;
  }

  const updates = Object.fromEntries(
    Object.entries({
      title: req.body.title,
      slug: req.body.slug,
      // Replaced wholesale, not merged. It is one ProseMirror document; merging
      // two of them key-by-key would produce a document neither author wrote.
      content: req.body.content,
      seo: req.body.seo,
      order: req.body.order,
    }).filter(([, v]) => v !== undefined),
  );

  const before = snapshot(step, DIFF_FIELDS);

  await step.update(updates);

  req.activity?.set({
    entityLabel: step.title,
    changes: buildChanges(before, snapshot(step, DIFF_FIELDS)),
  });

  return res.status(200).json({ success: true, data: step });
});

export const toggleStepStatus = asyncWrapper(async (req, res) => {
  const step = await ProjectStep.findByPk(req.params.id);

  if (!step) {
    return res.status(404).json({ success: false, message: "Step not found" });
  }

  await step.update({ isPublished: !step.isPublished });

  req.activity?.set({ entityLabel: step.title });

  return res.status(200).json({
    success: true,
    data: step,
    isPublished: step.isPublished,
  });
});

/** See the note on `reorderCategories` — whole array, same reasoning. */
export const reorderSteps = asyncWrapper(async (req, res) => {
  const project = await requireProject(req.params.projectId, res);
  if (!project) return;

  const { ids } = req.body;

  if (!Array.isArray(ids) || !ids.length) {
    return res
      .status(400)
      .json({ success: false, message: "ids must be a non-empty array" });
  }

  await db.sequelize.transaction(async (transaction) => {
    await Promise.all(
      ids.map((id, index) =>
        ProjectStep.update(
          { order: index },
          { where: { id, projectId: project.id }, transaction },
        ),
      ),
    );
  });

  req.activity?.set({
    entityLabel: project.title,
    metadata: { affectedCount: ids.length },
  });

  return res.status(200).json({ success: true, message: "Steps reordered" });
});

/** The "publish the whole guide" button — one call, not one per step. */
export const publishAllSteps = asyncWrapper(async (req, res) => {
  const project = await requireProject(req.params.projectId, res);
  if (!project) return;

  const [affectedCount] = await ProjectStep.update(
    { isPublished: true },
    { where: { projectId: project.id, isPublished: false } },
  );

  req.activity?.set({
    entityLabel: project.title,
    metadata: { affectedCount },
  });

  return res.status(200).json({
    success: true,
    message: `${affectedCount} step${affectedCount === 1 ? "" : "s"} published`,
    data: { affectedCount },
  });
});

export const deleteStep = asyncWrapper(async (req, res) => {
  const step = await ProjectStep.findByPk(req.params.id);

  if (!step) {
    return res.status(404).json({ success: false, message: "Step not found" });
  }

  req.activity?.set({ entityLabel: step.title });

  await step.destroy();

  return res
    .status(200)
    .json({ success: true, message: "Step deleted successfully" });
});
