import express from "express";
import {
  createCourse,
  deleteCourse,
  getAllCourses,
  getCourseById,
  listCourseLeads,
  removeBrochure,
  toggleCourseStatus,
  updateBrochure,
  updateCourse,
} from "../../controllers/course/crud.controller.js";
import {
  listCourseEmailTemplates,
  sendTestCourseEmail,
  upsertCourseEmailTemplate,
} from "../../controllers/course/emailTemplate.controller.js";
import {
  createCourseEnrollment,
  downloadCourseBrochure,
  getPublicCourseConfig,
  requestCourseBrochure,
} from "../../controllers/course/public.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { ADMIN_ROLES } from "../../config/constants/admin.js";

const router = express.Router();

// Base URL: /courses

// Creating and deleting a course are Super Admin only. A course is the
// commercial unit — its slug is immutable and every lead's `source` keys off
// it — so spinning one up or destroying one is not day-to-day editing. The
// rest of the admin routes stay open to any admin: they configure a course
// that already exists.
const superAdminOnly = [adminAuth, requireRole(ADMIN_ROLES.SUPER_ADMIN)];

router.post("/admin/create", superAdminOnly, createCourse);
router.get("/admin/courses", adminAuth, getAllCourses);
router.get("/admin/courses/:id", adminAuth, getCourseById);
router.put("/admin/courses/:id", adminAuth, updateCourse);
router.patch("/admin/courses/:id/toggle-status", adminAuth, toggleCourseStatus);
router.delete("/admin/courses/:id", superAdminOnly, deleteCourse);

router.put("/admin/courses/:id/brochure", adminAuth, updateBrochure);
router.delete("/admin/courses/:id/brochure", adminAuth, removeBrochure);

router.get("/admin/courses/:id/templates", adminAuth, listCourseEmailTemplates);
router.put(
  "/admin/courses/:id/templates/:type",
  adminAuth,
  upsertCourseEmailTemplate,
);
router.post(
  "/admin/courses/:id/templates/:type/test-send",
  adminAuth,
  sendTestCourseEmail,
);

router.get("/admin/courses/:id/leads", adminAuth, listCourseLeads);

// Public — consumed by each course's hand-built marketing page.
router.get("/public/:slug", getPublicCourseConfig);
router.post("/public/:slug/enroll", createCourseEnrollment);
router.post("/public/:slug/brochure", requestCourseBrochure);
router.get("/public/:slug/brochure", downloadCourseBrochure);

export default router;
