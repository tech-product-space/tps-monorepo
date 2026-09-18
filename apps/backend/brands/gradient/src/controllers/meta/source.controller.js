import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const { MetaAccount, MetaForm, MetaLead, MetaSource } = db;

/**
 * The source / sub source catalogue.
 *
 * Reachable by any authenticated admin, not just Super Admins: maintaining lead
 * taxonomy is lead work, and it is managed from the Meta Leads screen. The
 * Super Admin gate on the rest of `/meta` is about page access tokens, which
 * this has nothing to do with.
 */

/** Sources with their sub sources nested. One query, grouped in memory. */
export const listSources = asyncWrapper(async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";

  const where = includeInactive ? {} : { isActive: true };

  const rows = await MetaSource.findAll({
    where,
    order: [["displayName", "ASC"]],
    raw: true,
  });

  const roots = rows.filter((row) => !row.parentId);
  const children = rows.filter((row) => row.parentId);

  return res.json({
    success: true,
    data: roots.map((root) => ({
      ...root,
      subSources: children.filter((child) => child.parentId === root.id),
    })),
  });
});

export const createSource = asyncWrapper(async (req, res) => {
  const { key, displayName, parentId } = req.body || {};

  if (!key || !displayName) {
    return res.status(400).json({
      success: false,
      message: "key and displayName are required",
    });
  }

  if (parentId) {
    const parent = await MetaSource.findByPk(parentId);

    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent source not found" });
    }

    // Two levels, deliberately. A deeper tree would need a recursive picker and
    // a recursive resolver, and nobody has asked for "sub sub source".
    if (parent.parentId) {
      return res.status(400).json({
        success: false,
        message: "A sub source cannot have sub sources of its own",
      });
    }
  }

  try {
    const source = await MetaSource.create({
      key,
      displayName,
      parentId: parentId || null,
      isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
    });

    req.activity?.set({ entityLabel: source.displayName });

    return res.status(201).json({
      success: true,
      message: parentId ? "Sub source added" : "Source added",
      data: source,
    });
  } catch (error) {
    // The partial unique indexes are what actually enforce this; the friendly
    // message is here because a raw constraint name helps nobody.
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: `"${key}" already exists${parentId ? " under this source" : ""}`,
      });
    }

    throw error;
  }
});

/**
 * Rename or retire. **`key` is not editable.**
 *
 * Leads store a frozen copy of the key, so changing it here would not migrate
 * anything — it would just split one source into two that no filter can
 * reconcile, which is the exact failure this catalogue exists to prevent.
 * Renaming the `displayName` is free and does everything anyone actually wants.
 */
export const updateSource = asyncWrapper(async (req, res) => {
  const source = await MetaSource.findByPk(req.params.id);

  if (!source) {
    return res.status(404).json({ success: false, message: "Source not found" });
  }

  if (req.body.displayName !== undefined) {
    source.displayName = req.body.displayName;
  }

  if (req.body.isActive !== undefined) {
    source.isActive = Boolean(req.body.isActive);
  }

  await source.save();

  req.activity?.set({ entityLabel: source.displayName });

  return res.json({
    success: true,
    message: "Source updated",
    data: source,
  });
});

/**
 * Delete, but only when nothing depends on it.
 *
 * Existing leads are safe either way — they hold their own frozen copy — but a
 * form still pointing here would silently fall back to the account default, and
 * "my leads started arriving under the wrong source" is a miserable thing to
 * debug. Retiring (`isActive: false`) is the non-destructive alternative and is
 * what the panel offers first.
 */
export const deleteSource = asyncWrapper(async (req, res) => {
  const source = await MetaSource.findByPk(req.params.id);

  if (!source) {
    return res.status(404).json({ success: false, message: "Source not found" });
  }

  const [formCount, accountCount, leadCount, childCount] = await Promise.all([
    MetaForm.count({
      where: { [Op.or]: [{ sourceId: source.id }, { subSourceId: source.id }] },
    }),
    MetaAccount.count({
      where: {
        [Op.or]: [{ defaultSourceId: source.id }, { defaultSubSourceId: source.id }],
      },
    }),
    MetaLead.count({ where: { source: source.key } }),
    MetaSource.count({ where: { parentId: source.id } }),
  ]);

  if (formCount || accountCount) {
    return res.status(409).json({
      success: false,
      message:
        `In use by ${formCount} form(s) and ${accountCount} page default(s). ` +
        "Re-map those first, or retire this source instead of deleting it.",
    });
  }

  if (leadCount) {
    return res.status(409).json({
      success: false,
      message:
        `${leadCount} lead(s) were imported under this source. Retire it instead — ` +
        "deleting would leave those leads labelled with a source nothing can filter by.",
    });
  }

  req.activity?.set({
    entityLabel: source.displayName,
    metadata: { subSourcesRemoved: childCount },
  });

  // Sub sources cascade with the parent, per the FK.
  await source.destroy();

  return res.json({ success: true, message: "Source deleted" });
});
