import express from "express";

import {
  createFreeCourse,
  getAllFreeCourses,
  getAllPublishedFreeCourses,
  getCourseDetails,
  getBasicCourseDetails,
  getFreeCourseStructureBySlug,
  getCourseProgress,
  getLessonBySlug,
  getFreeCourseById,
  updateFreeCourse,
  deleteFreeCourse,
  toggleFreeCourseStatus,
  checkFreeCourseSlugAvailability,
} from "../../controllers/freeCourses/crud.controller.js";

import { getMyCourses } from "../../controllers/dashboard/mine.controller.js";

import {
  createPreviewToken,
  verifyPreviewSession,
} from "../../controllers/freeCourses/preview.controller.js";

import { bulkPublishCurriculum } from "../../controllers/freeCourses/publish.controller.js";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { previewAuth } from "../../middlewares/previewAuth.middleware.js";
import { previewLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

import freeCourseMouleRoutes from "./module.routes.js";
import freeCourseLessonRoutes from "./lesson.route.js";
import freeCourseUserRoutes from "./user.route.js";
import freeCourseCertificateRoutes from "./certificate.routes.js";
/**
 * ALL ROUTES ARE ADMIN PROTECTED
 */

router.use("/module", freeCourseMouleRoutes)
router.use("/lesson", freeCourseLessonRoutes)
router.use("/user", freeCourseUserRoutes)
// Mounted above "/:id" so "certificates" is never matched as a course id.
router.use("/certificates", freeCourseCertificateRoutes)

router.post("/create", adminAuth, createFreeCourse);
router.get("/all", adminAuth, getAllFreeCourses);
router.get("/check-slug", adminAuth, checkFreeCourseSlugAvailability);

// Dashboard — identity from the cookie, never a parameter. Declared before
// "/:id" so "mine" is not swallowed as a course id.
router.get("/mine", authMiddleware, getMyCourses);

// Preview. Declared before "/:id" so "preview" is not swallowed as a course id.
// Verify is public on purpose — the caller is the marketing site's route
// handler, which holds no admin credentials; the launch token is the credential.
router.post("/preview/verify", previewLimiter, verifyPreviewSession);

router.get("/get-all-courses", getAllPublishedFreeCourses);

// getCourseDetails has never filtered on isPublished — the public course page
// is what gates a draft, so there is nothing to lift here.
router.get("/slug/:slug", getCourseDetails);
router.get("/slug/:slug/basic", getBasicCourseDetails);
router.get("/slug/:slug/structure", previewAuth("freeCourse", "slug"), getFreeCourseStructureBySlug);
router.get("/slug/:slug/progress", getCourseProgress);
router.get(
  "/slug/:courseSlug/module/:moduleSlug/lesson/:lessonSlug",
  previewAuth("freeCourse", "slug"),
  getLessonBySlug,
);

router.post("/:id/preview-token", adminAuth, previewLimiter, createPreviewToken);

// Bulk publish across the course's curriculum. Scoped to ":id" — the ids in the
// body are filtered against it rather than trusted.
router.patch("/:id/curriculum/publish", adminAuth, bulkPublishCurriculum);

router.get("/:id", adminAuth, getFreeCourseById);
router.put("/:id", adminAuth, updateFreeCourse);
router.delete("/:id", adminAuth, deleteFreeCourse);
router.patch("/:id/toggle-status", adminAuth, toggleFreeCourseStatus);




export default router;