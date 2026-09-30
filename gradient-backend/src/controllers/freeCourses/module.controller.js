import db from "../../database/postgres/models/index.js";
const { FreeCourseModule, FreeCourseLesson, FreeCourse } = db;

import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
    readBatch,
    readTitleAndSlug,
    uniqueSlug,
} from "../../util/helpers/importBatch.js";

// CREATE MODULE
export const createModule = asyncWrapper(async (req, res) => {
    const { courseId } = req.params;
    const { title, slug, subTitle, overview } = req.body;

    if (!title || !slug) {
        return res.status(400).json({
            success: false,
            message: "title and slug are required",
        });
    }

    const course = await FreeCourse.findByPk(courseId);
    if (!course) {
        return res.status(404).json({
            success: false,
            message: "Course not found",
        });
    }

    const maxOrder =
        (await FreeCourseModule.max("order", {
            where: { freeCourseId: courseId },
        })) || 0;

    const module = await FreeCourseModule.create({
        freeCourseId: courseId,
        title,
        subTitle,
        slug,
        overview: overview || {},
        order: maxOrder + 1,
    });

    return res.status(201).json({
        success: true,
        data: module,
    });
});

// BULK IMPORT MODULES
// Backs the admin panel's "Import Modules" dialog. Validates the whole batch
// before writing anything, so the admin never has to reconcile a partial import.
export const importModules = asyncWrapper(async (req, res) => {
    const { courseId } = req.params;

    const { items, error: batchError } = readBatch(req.body, "modules");
    if (batchError) {
        return res.status(400).json({ success: false, message: batchError });
    }

    const course = await FreeCourse.findByPk(courseId);
    if (!course) {
        return res.status(404).json({
            success: false,
            message: "Course not found",
        });
    }

    // Module slugs have no unique constraint, so uniqueness is enforced here
    // against both the existing rows and the rest of this batch.
    const existing = await FreeCourseModule.findAll({
        where: { freeCourseId: courseId },
        attributes: ["slug"],
    });
    const taken = new Set(existing.map((m) => m.slug));

    const rows = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const label = `Module ${i + 1}`;

        const { title, slug, error } = readTitleAndSlug(item, label);
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        if (item.subTitle !== undefined && typeof item.subTitle !== "string") {
            return res.status(400).json({
                success: false,
                message: `${label} has a "subTitle" that isn't a string.`,
            });
        }

        if (
            item.overview !== undefined &&
            (typeof item.overview !== "object" || Array.isArray(item.overview))
        ) {
            return res.status(400).json({
                success: false,
                message: `${label} has an "overview" that isn't an object.`,
            });
        }

        rows.push({
            freeCourseId: courseId,
            title,
            subTitle: typeof item.subTitle === "string" ? item.subTitle.trim() : null,
            slug: uniqueSlug(slug, taken),
            overview: item.overview || {},
            // Imported modules stay hidden until someone reviews and publishes.
            isPublished: false,
        });
    }

    const maxOrder =
        (await FreeCourseModule.max("order", {
            where: { freeCourseId: courseId },
        })) || 0;

    rows.forEach((row, i) => {
        row.order = maxOrder + i + 1;
    });

    const created = await db.sequelize.transaction((transaction) =>
        FreeCourseModule.bulkCreate(rows, { transaction }),
    );

    return res.status(201).json({
        success: true,
        message: `Imported ${created.length} module${created.length === 1 ? "" : "s"} as drafts.`,
        data: created,
    });
});

// GET MODULES BY COURSE
export const getModulesByCourse = asyncWrapper(async (req, res) => {
    const { courseId } = req.params;

    const modules = await FreeCourseModule.findAll({
        where: {
            freeCourseId: courseId,
        },

        order: [["order", "ASC"]],

        include: [
            {
                model: FreeCourseLesson,
                as: "lessons",
                
                attributes: [
                    "id",
                    "title",
                    "slug",
                    "order",
                    "isPublished",
                ],

                required: false,

                order: [["order", "ASC"]],
            },
        ],
    });

    return res.json({
        success: true,
        data: modules,
    });
});

// GET PUBLISEHD MODULES BY COURSE
export const getPublishedModulesByCourse = asyncWrapper(async (req, res) => {
    const { courseId } = req.params;

    // With an in-scope preview token the drafts come too, each carrying its own
    // isPublished so the curriculum can chip them. `previewAuth` has already
    // checked the token was minted for this courseId.
    const previewing = Boolean(req.preview);
    const publishFilter = previewing ? {} : { isPublished: true };

    const withFlag = (attributes) =>
        previewing ? [...attributes, "isPublished"] : attributes;

    const modules = await FreeCourseModule.findAll({
        attributes: withFlag([
            "id", "title", "subTitle", "slug", "overview", "order",
        ]),
        where: {
            freeCourseId: courseId,
            ...publishFilter
        },

        include: [
            {
                model: FreeCourseLesson,
                as: "lessons",

                attributes: withFlag(["id", "title", "slug", "order"]),

                where: { ...publishFilter },

                // Modules with no published lessons must still render their
                // header row on the course page.
                required: false,
            },
        ],

        order: [
            ["order", "ASC"],
            [{ model: FreeCourseLesson, as: "lessons" }, "order", "ASC"],
        ],
    });

    return res.json({
        success: true,
        data: modules,
    });
});

// UPDATE MODULE
export const updateModule = asyncWrapper(async (req, res) => {
    const { id } = req.params;

    const module = await FreeCourseModule.findByPk(id);
    if (!module) {
        return res.status(404).json({
            success: false,
            message: "Module not found",
        });
    }

    await module.update(req.body);

    return res.json({
        success: true,
        data: module,
    });
});

// DELETE MODULE
export const deleteModule = asyncWrapper(async (req, res) => {
    const { id } = req.params;

    const module = await FreeCourseModule.findByPk(id);
    if (!module) {
        return res.status(404).json({
            success: false,
            message: "Module not found",
        });
    }

    // Captured before the row goes — the log's automatic label lookup cannot
    // help once the record is deleted.
    req.activity?.set({ entityLabel: module.title });

    await module.destroy();

    return res.json({
        success: true,
        message: "Module deleted",
    });
});

// REORDER MODULES
export const reorderModules = asyncWrapper(async (req, res) => {
    const { courseId } = req.params;
    const { moduleIds } = req.body;

    if (!Array.isArray(moduleIds)) {
        return res.status(400).json({
            success: false,
            message: "moduleIds must be an array",
        });
    }

    for (let i = 0; i < moduleIds.length; i++) {
        await FreeCourseModule.update(
            { order: i + 1 },
            {
                where: {
                    id: moduleIds[i],
                    freeCourseId: courseId,
                },
            }
        );
    }

    return res.json({
        success: true,
        message: "Modules reordered",
    });
});

// CHECK SLUG AVAILIBLITY
export const checkModuleSlugAvailability = asyncWrapper(async (req, res) => {
    const { courseId } = req.params;
    const { excludeId } = req.query;
    const rawSlug = req.query.slug?.trim();

    if (!rawSlug) {
        return res.status(400).json({
            success: false,
            available: false,
            message: "Slug is required",
        });
    }

    const slug = rawSlug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const whereClause = {
        slug,
        freeCourseId: courseId,
    };

    if (excludeId) {
        whereClause.id = { [Op.ne]: excludeId };
    }

    const existing = await FreeCourseModule.findOne({
        where: whereClause,
    });

    return res.json({
        success: true,
        slug,
        available: !existing,
    });
});

// TOGGLE STATUS
export const toggleModuleStatus = asyncWrapper(async (req, res) => {
    const { id } = req.params;

    const module = await FreeCourseModule.findByPk(id);

    if (!module) {
        return res.status(404).json({
            success: false,
            message: "Module not found",
        });
    }

    const newStatus = !module.isPublished;

    await module.update({ isPublished: newStatus });

    return res.status(200).json({
        success: true,
        message: `Module ${newStatus ? "published" : "moved to draft"
            } successfully`,
        data: {
            id: module.id,
            isPublished: newStatus,
        },
    });
});