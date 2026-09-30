import db from "../../database/postgres/models/index.js";
const {
    FreeCourseLesson,
    FreeCourseModule,
    FreeCourseLessonProgress,
    FreeCourseCertificate,
} = db;

import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { emitLessonCompleted } from "../../services/leadEvent/emitters.js";
import {
    FREE_COURSE_CERTIFICATE_ISSUED_VIA,
    FREE_COURSE_CERTIFICATE_STATUS,
} from "../../config/constants/freeCourseCertificate.js";
import { ensureCourseCertificate } from "../../services/freeCourse/certificateAutoIssue.service.js";
import { resolveCourseProgress } from "../../services/freeCourse/lessonProgress.service.js";
import {
    readBatch,
    readTitleAndSlug,
    uniqueSlug,
} from "../../util/helpers/importBatch.js";


// CREATE LESSON
export const createLesson = asyncWrapper(async (req, res) => {
    const { moduleId } = req.params;

    const {
        title,
        slug,
        content,
        isPublished,
        seo,
    } = req.body;

    if (!title || !slug ) {
        return res.status(400).json({
            success: false,
            message: "title, slug and content are required",
        });
    }

    const module = await FreeCourseModule.findByPk(moduleId);

    if (!module) {
        return res.status(404).json({
            success: false,
            message: "Module not found",
        });
    }

    const maxOrder =
        (await FreeCourseLesson.max("order", {
            where: {
                freeCourseModuleId: moduleId,
            },
        })) || 0;

    const lesson = await FreeCourseLesson.create({
        freeCourseModuleId: moduleId,
        title,
        slug,
        content,
        isPublished: isPublished || false,
        seo: seo || {},
        order: maxOrder + 1,
    });

    return res.status(201).json({
        success: true,
        data: lesson,
    });
});


// BULK IMPORT LESSONS
// Backs the admin panel's "Import Lessons" dialog, which splits an uploaded
// Google Doc into one lesson per heading. Content arrives as TipTap/ProseMirror
// JSON, already converted client-side. All-or-nothing, same as module import.
export const importLessons = asyncWrapper(async (req, res) => {
    const { moduleId } = req.params;

    const { items, error: batchError } = readBatch(req.body, "lessons");
    if (batchError) {
        return res.status(400).json({ success: false, message: batchError });
    }

    const module = await FreeCourseModule.findByPk(moduleId);
    if (!module) {
        return res.status(404).json({
            success: false,
            message: "Module not found",
        });
    }

    // Lesson slugs have no unique constraint; uniqueness is enforced here
    // against the existing rows and the rest of this batch.
    const existing = await FreeCourseLesson.findAll({
        where: { freeCourseModuleId: moduleId },
        attributes: ["slug"],
    });
    const taken = new Set(existing.map((l) => l.slug));

    const rows = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const label = `Lesson ${i + 1}`;

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
            freeCourseModuleId: moduleId,
            title,
            slug: uniqueSlug(slug, taken),
            content: item.content || {},
            seo: item.seo && typeof item.seo === "object" ? item.seo : {},
            // Imported lessons stay hidden until someone reviews and publishes.
            isPublished: false,
        });
    }

    const maxOrder =
        (await FreeCourseLesson.max("order", {
            where: { freeCourseModuleId: moduleId },
        })) || 0;

    rows.forEach((row, i) => {
        row.order = maxOrder + i + 1;
    });

    const created = await db.sequelize.transaction((transaction) =>
        FreeCourseLesson.bulkCreate(rows, { transaction }),
    );

    return res.status(201).json({
        success: true,
        message: `Imported ${created.length} lesson${created.length === 1 ? "" : "s"} as drafts.`,
        data: created,
    });
});


// UPDATE LESSON
export const updateLesson = asyncWrapper(async (req, res) => {
    const { id } = req.params;

    const lesson = await FreeCourseLesson.findByPk(id);

    if (!lesson) {
        return res.status(404).json({
            success: false,
            message: "Lesson not found",
        });
    }

    await lesson.update(req.body);

    return res.json({
        success: true,
        data: lesson,
    });
});


// DELETE LESSON
export const deleteLesson = asyncWrapper(async (req, res) => {
    const { id } = req.params;

    const lesson = await FreeCourseLesson.findByPk(id);

    if (!lesson) {
        return res.status(404).json({
            success: false,
            message: "Lesson not found",
        });
    }

    // Captured before the row goes — the log's automatic label lookup cannot
    // help once the record is deleted.
    req.activity?.set({ entityLabel: lesson.title });

    await lesson.destroy();

    return res.json({
        success: true,
        message: "Lesson deleted",
    });
});


// GET LESSON BY ID
export const getLessonById = asyncWrapper(async (req, res) => {
    const { id } = req.params;

    const lesson = await FreeCourseLesson.findByPk(id);

    if (!lesson) {
        return res.status(404).json({
            success: false,
            message: "Lesson not found",
        });
    }

    return res.json({
        success: true,
        data: lesson,
    });
});

// REORDER LESSONS
export const reorderLessons = asyncWrapper(async (req, res) => {
    const { moduleId } = req.params;
    const { lessonIds } = req.body;

    if (!Array.isArray(lessonIds)) {
        return res.status(400).json({
            success: false,
            message: "lessonIds must be an array",
        });
    }

    for (let i = 0; i < lessonIds.length; i++) {
        await FreeCourseLesson.update(
            {
                order: i + 1,
            },
            {
                where: {
                    id: lessonIds[i],
                    freeCourseModuleId: moduleId,
                },
            }
        );
    }

    return res.json({
        success: true,
        message: "Lessons reordered",
    });
});


// CHECK SLUG AVAILABILITY
export const checkLessonSlugAvailability = asyncWrapper(async (req, res) => {
    const { moduleId } = req.params;
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
        freeCourseModuleId: moduleId,
    };

    if (excludeId) {
        whereClause.id = {
            [Op.ne]: excludeId,
        };
    }

    const existing = await FreeCourseLesson.findOne({
        where: whereClause,
    });

    return res.json({
        success: true,
        slug,
        available: !existing,
    });
});


// UPDATE LESSON STATUS
export const updateLessonStatus = asyncWrapper(async (req, res) => {
    const { id } = req.params;

    // The module is included for its course id — see the certificate-holder
    // count below, which is the whole reason this is not a bare findByPk.
    const lesson = await FreeCourseLesson.findByPk(id, {
        include: [{ model: FreeCourseModule, attributes: ["id", "freeCourseId"] }],
    });

    if (!lesson) {
        return res.status(404).json({
            success: false,
            message: "Lesson not found",
        });
    }

    const courseId = lesson.FreeCourseModule?.freeCourseId || null;

    const newStatus = !lesson.isPublished;

    await lesson.update({
        isPublished: newStatus,
    });

    /**
     * How many people already hold a certificate for this course.
     *
     * Toggling a lesson silently changes what "finished" means for everybody
     * who has already finished. Their certificates are untouched — revoking one
     * somebody downloaded because the syllabus grew is indefensible — but the
     * course starts reading as incomplete for them, and an admin should find
     * that out from a confirm dialog rather than from a support ticket.
     *
     * Returned rather than enforced: this is information for the panel, not a
     * reason to refuse the toggle.
     */
    const certificateHolders = courseId
        ? await FreeCourseCertificate.count({
            where: {
                freeCourseId: courseId,
                status: FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
            },
        })
        : 0;

    return res.status(200).json({
        success: true,
        message: `Lesson ${newStatus ? "published" : "moved to draft"
            } successfully`,
        data: {
            id: lesson.id,
            isPublished: newStatus,
            certificateHolders,
        },
    });
});

// COMPLETE LESSON
export const completeLesson = asyncWrapper(async (req, res) => {
    const { id: lessonId } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "userId is required",
        });
    }

    // The module is what knows the course, and the certificate check needs the
    // course id. Resolved once here rather than looked up again downstream.
    const lesson = await FreeCourseLesson.findByPk(lessonId, {
        include: [
            {
                model: FreeCourseModule,
                attributes: ["id", "freeCourseId"],
            },
        ],
    });

    if (!lesson) {
        return res.status(404).json({
            success: false,
            message: "Lesson not found",
        });
    }

    const courseId = lesson.FreeCourseModule?.freeCourseId || null;

    const [record] = await FreeCourseLessonProgress.findOrCreate({
        where: {
            userId,
            freeCourseLessonId: lessonId,
        },
        defaults: {
            completed: true,
            completedAt: new Date(),
        },
    });

    // `wasAlreadyComplete` is the whole point of the branch below: re-marking a
    // finished lesson must not put a second "completed a lesson" on the
    // timeline. The emitter's dedupe key would catch it anyway; not calling is
    // cheaper and says the intent out loud.
    const wasAlreadyComplete = record.completed;

    if (!record.completed) {
        await record.update({
            completed: true,
            completedAt: new Date(),
        });
    }

    if (!wasAlreadyComplete) {
        // Fire-and-forget. The emitter works out the course and whether this
        // was the last lesson; none of that belongs on this response.
        emitLessonCompleted(record);
    }

    /**
     * Was that the last one — and if so, is a certificate owed?
     *
     * Completion is answered **here**, by the same helper the dashboard and the
     * course page use, and never inferred from what the certificate service
     * came back with. Reading it off that status was a real bug: `ensure`
     * returns `off`, `not_ready`, `no_email` and friends *before* it ever
     * counts lessons, so on a course with auto-issue switched off — or simply
     * without a template yet — every lesson completion answered
     * `courseCompleted: true` and the player congratulated people on finishing
     * at lesson two.
     *
     * `ensureCourseCertificate` then only runs when the course is actually
     * finished, which is the only time it can do anything, and spares the
     * common case two queries.
     *
     * Awaited rather than fired and forgotten, because the answer goes into
     * this response: the player opens its completion modal in the right state
     * immediately instead of guessing and polling from cold.
     *
     * `ensureCourseCertificate` never throws — a failure here must not turn a
     * successful "mark complete" into a 500.
     */
    let certificate = null;
    let courseCompleted = false;

    if (courseId) {
        const { completedCourse } = await resolveCourseProgress(userId, courseId);

        courseCompleted = completedCourse;

        if (courseCompleted) {
            const result = await ensureCourseCertificate({
                userId,
                courseId,
                via: FREE_COURSE_CERTIFICATE_ISSUED_VIA.AUTO,
            });

            /*
             * The same shape `ensureMyCourseCertificate` returns, deliberately.
             *
             * This used to be a flatter `{ status, certificateNo }`, while the
             * player typed both responses as one `CourseCertificateState`. So
             * `certificate.certificate` was always undefined down this path, and
             * the modal's "is it ready?" test — which reads that nested row — fell
             * through to "still rendering" for somebody who already held a
             * finished certificate. It then polled, found one, and congratulated
             * them on earning what they had earned weeks earlier.
             */
            certificate = {
                status: result.status,
                certificate: result.certificate || null,
                completed: result.completed ?? null,
                total: result.total ?? null,
            };
        }
    }

    return res.status(200).json({
        success: true,
        lessonId,
        completed: true,
        courseCompleted,
        certificate,
    });
});