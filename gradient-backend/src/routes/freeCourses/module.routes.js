import express from "express";

import {
  createModule,
  importModules,
  getModulesByCourse,
  getPublishedModulesByCourse,
  updateModule,
  deleteModule,
  reorderModules,
  checkModuleSlugAvailability,
  toggleModuleStatus
} from "../../controllers/freeCourses/module.controller.js";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { previewAuth } from "../../middlewares/previewAuth.middleware.js";

const router = express.Router();

/**
 * ALL MODULE ROUTES ARE ADMIN PROTECTED
 */
router.post("/create/:courseId", adminAuth, createModule);
router.post("/import/:courseId", adminAuth, importModules);
router.get("/all/:courseId", adminAuth, getModulesByCourse);
router.get("/published/:courseId", previewAuth("freeCourse", "id"), getPublishedModulesByCourse);
router.put("/reorder/:courseId", adminAuth, reorderModules);

router.put("/update/:id", adminAuth, updateModule);
router.delete("/delete/:id", adminAuth, deleteModule);

router.get("/check-slug/:courseId", adminAuth, checkModuleSlugAvailability);
router.patch("/toggle-status/:id", adminAuth, toggleModuleStatus);

export default router;