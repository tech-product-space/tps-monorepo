const express = require("express");
const router = express.Router();
const asyncWrapper = require("../../utils/asyncWrapper");
const lessonsController = require("../../controllers/courses/lessonsController");
const previewAuth = require("../../middlewares/previewAuth");
const requireStaff = require("../../middlewares/requireStaff");
const {
  createLessonPreviewToken,
  verifyLessonPreviewSession,
} = require("../../controllers/courses/lessonPreviewController");

/**
 * BASE_URL: /courses
 */

//crud
router.get("/modules/lessons/:id",asyncWrapper(lessonsController.getById));
router.put("/modules/lessons/:id",asyncWrapper(lessonsController.update));
router.delete("/modules/lessons/:id", asyncWrapper(lessonsController.delete));
router.put("/modules/lessons/:id/status", asyncWrapper(lessonsController.updateLessonStatus));
router.post("/modules/lessons/:id/complete",asyncWrapper(lessonsController.completeLesson));

router.post("/modules/:moduleId/lessons/import", asyncWrapper(lessonsController.importLessons));
router.post("/modules/:moduleId/lessons", asyncWrapper(lessonsController.create));
router.get("/modules/:moduleId/lessons", asyncWrapper(lessonsController.getByModuleId));
router.get("/modules/:moduleId/lessons/check-slug", asyncWrapper(lessonsController.checkSlugAvailability));
router.put("/modules/:moduleId/lessons/reorder", asyncWrapper(lessonsController.reorder));
// Distinct from "/modules/lessons/:id/status" above: that path's 2nd segment is
// the literal "lessons", this one's is a module id, so the two never collide.
router.put("/modules/:moduleId/lessons/status", asyncWrapper(lessonsController.bulkUpdateStatus));

/* ── preview ────────────────────────────────────────────────────────────── */
// See `../../controllers/courses/lessonPreviewController.js`. Mint is
// staff-only; verify deliberately is not, because the caller is the public
// site's own route handler and the single-use launch token is the credential.
router.post(
  "/admin/lessons/:id/preview-token",
  requireStaff,
  createLessonPreviewToken,
);

router.post("/preview/verify", verifyLessonPreviewSession);

// public
// `previewAuth` is optional: no token, one for another lesson, or an expired
// one, and this stays the endpoint every visitor already gets.
router.get(
  "/:courseSlug/modules/:moduleSlug/lessons/:lessonSlug",
  previewAuth("lesson"),
  asyncWrapper(lessonsController.getBySlug),
);

module.exports = router;
