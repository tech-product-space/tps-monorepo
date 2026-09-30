const express = require('express');
const router = express.Router();
const asyncWrapper = require('../../utils/asyncWrapper');

const moduleRoutes = require('./moduleRoutes');
const moduleLessonsRoutes = require('./moduleLessonsRoutes');
const faqsRoutes = require('./faqRoutes');
const certificateRoutes = require("./certificateRoutes");

const courseController = require('../../controllers/courses/coursesController');
const enrollmentController = require('../../controllers/courses/courseEnrollmentController');

// BASE_URL: /courses

//course modules
router.use("/modules", moduleRoutes);


// Course FAQs
router.use("/faqs", faqsRoutes);

//course modules lessons
router.use("/", moduleLessonsRoutes);

// certificate routes
router.use("/", certificateRoutes);

// --------------------
// courses crud (admin)
// --------------------
router.get("/admin/all", asyncWrapper(courseController.getAll));
router.get("/admin/:id/full", asyncWrapper(courseController.getFullDetailsById));
router.get("/check-slug", asyncWrapper(courseController.checkSlugAvailability));

router.post("/", asyncWrapper(courseController.create));
router.put("/:id", asyncWrapper(courseController.update));
router.delete("/:id", asyncWrapper(courseController.delete));

router.get("/:courseId/enrollments", asyncWrapper(enrollmentController.getEnrollmentsByCourse));
router.put("/:id/status", asyncWrapper(courseController.updateCourseStatus));


// --------------------
// public routes
// --------------------
router.get("/", asyncWrapper(courseController.getPublished));
router.get("/my-courses", asyncWrapper(enrollmentController.getUserCourses));
router.get("/slug/:slug", asyncWrapper(courseController.getBySlug));
router.get("/slug/:slug/full", asyncWrapper(courseController.getFullDetailsBySlug));
router.get("/slug/:slug/structure", asyncWrapper(courseController.getCourseStructureBySlug));
router.get("/slug/:slug/progress", asyncWrapper(courseController.getCourseProgress));

// enrollment
router.post("/slug/:slug/enroll", asyncWrapper(enrollmentController.enrollBySlug));
router.get("/slug/:slug/enrollment", asyncWrapper(enrollmentController.checkEnrollmentBySlug));

module.exports = router;
