const express = require("express");
const router = express.Router();

const enrollmentController = require("../controllers/workflow/enrollment.controller");

router.get("/", enrollmentController.listEnrollments);
// Bulk-cancel must be registered before /:id so the literal path wins.
router.post("/bulk-cancel", enrollmentController.bulkCancelEnrollments);
router.get("/:id", enrollmentController.getEnrollment);
router.get("/:id/logs", enrollmentController.getEnrollmentLogs);
router.get("/:id/events", enrollmentController.getEnrollmentEvents);
router.post("/:id/cancel", enrollmentController.cancelEnrollment);

module.exports = router;
